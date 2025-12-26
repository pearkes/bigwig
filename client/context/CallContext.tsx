import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { RECONNECT_DELAYS } from "../constants/timeouts";
import { DEFAULT_VOICE } from "../constants/voice";
import { fetchWithAuth, safeJson } from "../services/apiService";
import {
	addCallIdListener,
	CallState,
	useOpenAICall,
} from "../services/callkitService";
import { getSession } from "../services/storageService";
import type { CallStatus } from "../types/call";
import { useAuth } from "./AuthContext";
import { useSettings } from "./SettingsContext";
import { useTasks } from "./TasksContext";
import { useUI } from "./UIContext";

type CallContextValue = {
	callState: CallState;
	callStatus: CallStatus;
	isMuted: boolean;
	isSpeakerEnabled: boolean;
	isStarting: boolean;
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	toggleMute: () => Promise<void>;
	toggleSpeaker: () => Promise<void>;
};

const CallContext = createContext<CallContextValue | undefined>(undefined);

export const CallProvider = ({ children }: { children: React.ReactNode }) => {
	const { serverUrl, muteMicByDefault, autoStartVoice } = useSettings();
	const { workerConnected, broadcastSystemMessage, sendCallHeartbeat } =
		useTasks();
	const { setErrorMessage } = useUI();
	const { authStatus } = useAuth();

	const [isStarting, setIsStarting] = useState(false);
	const isConnectingRef = useRef(false);
	const pendingEphemeralKeyRef = useRef<string | null>(null);
	const pendingCallIdRef = useRef<string | null>(null);
	const callHeartbeatActiveRef = useRef(false);
	const sidebandRetryRef = useRef<{
		timeout: ReturnType<typeof setTimeout> | null;
		attempts: number;
	}>({
		timeout: null,
		attempts: 0,
	});
	const hasAutoStartedRef = useRef(false);

	const {
		callState,
		isMuted,
		isSpeakerEnabled,
		error: callError,
		startCall,
		endCall,
		setMuted,
		setSpeakerEnabled,
	} = useOpenAICall();

	useEffect(() => {
		if (callError) {
			console.log(
				"[CallKit] Error received:",
				callError.code,
				callError.message,
			);
		}
	}, [callError]);

	const callStatus: CallStatus = useMemo(() => {
		console.log("[callState] Native state:", callState);
		switch (callState) {
			case CallState.Connected:
				return "connected";
			case CallState.Starting:
			case CallState.Connecting:
				return "connecting";
			case CallState.Failed:
				return "error";
			default:
				return "idle";
		}
	}, [callState]);

	const clearSidebandRetry = useCallback(() => {
		if (sidebandRetryRef.current.timeout) {
			clearTimeout(sidebandRetryRef.current.timeout);
			sidebandRetryRef.current.timeout = null;
		}
		sidebandRetryRef.current.attempts = 0;
	}, []);

	const attemptSidebandConnect = useCallback(
		async (callId: string, ephemeralKey: string): Promise<boolean> => {
			if (!serverUrl) return false;
			try {
				const connectRes = await fetchWithAuth({
					url: `${serverUrl}/connect`,
					context: { getSession },
					options: {
						method: "POST",
						body: JSON.stringify({
							call_id: callId,
							ephemeral_key: ephemeralKey,
						}),
					},
				});
				if (!connectRes.ok) {
					const message = `Worker sideband connection failed (status ${connectRes.status}).`;
					console.warn("[connect] Failed to connect worker sideband");
					setErrorMessage(message);
					broadcastSystemMessage(message, false);
					return false;
				}
				console.log("[connect] Worker sideband connected");
				clearSidebandRetry();
				return true;
			} catch (e) {
				console.warn("[connect] Error connecting sideband:", e);
				const message = "Worker sideband connection error.";
				setErrorMessage(message);
				broadcastSystemMessage(message, false);
				return false;
			}
		},
		[serverUrl, broadcastSystemMessage, setErrorMessage, clearSidebandRetry],
	);

	const scheduleSidebandRetry = useCallback(
		(callId: string, ephemeralKey: string) => {
			if (sidebandRetryRef.current.timeout) return;
			const attempt = sidebandRetryRef.current.attempts;
			const delay =
				RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
			sidebandRetryRef.current.attempts += 1;
			sidebandRetryRef.current.timeout = setTimeout(() => {
				sidebandRetryRef.current.timeout = null;
				attemptSidebandConnect(callId, ephemeralKey).then((ok) => {
					if (!ok) scheduleSidebandRetry(callId, ephemeralKey);
				});
			}, delay);
		},
		[attemptSidebandConnect],
	);

	useEffect(() => {
		if (!serverUrl) return;
		const unsubCallId = addCallIdListener(async (event) => {
			console.log("[CallKit] Received call ID:", event.callId);

			const ephemeralKey = pendingEphemeralKeyRef.current;
			if (event.callId && ephemeralKey) {
				pendingCallIdRef.current = event.callId;
				sendCallHeartbeat({ callId: event.callId, ephemeralKey, active: true });
				const ok = await attemptSidebandConnect(event.callId, ephemeralKey);
				if (!ok) {
					scheduleSidebandRetry(event.callId, ephemeralKey);
				}
			}
		});

		return () => unsubCallId();
	}, [
		serverUrl,
		attemptSidebandConnect,
		scheduleSidebandRetry,
		sendCallHeartbeat,
	]);

	useEffect(() => {
		if (callStatus !== "connected") {
			if (callHeartbeatActiveRef.current) {
				const callId = pendingCallIdRef.current;
				const ephemeralKey = pendingEphemeralKeyRef.current;
				if (callId && ephemeralKey) {
					sendCallHeartbeat({ callId, ephemeralKey, active: false });
				}
			}
			callHeartbeatActiveRef.current = false;
			return;
		}

		callHeartbeatActiveRef.current = true;
		const heartbeat = () => {
			const callId = pendingCallIdRef.current;
			const ephemeralKey = pendingEphemeralKeyRef.current;
			if (callId && ephemeralKey) {
				sendCallHeartbeat({ callId, ephemeralKey, active: true });
			}
		};

		heartbeat();
		const interval = setInterval(heartbeat, 15000);
		return () => clearInterval(interval);
	}, [callStatus, sendCallHeartbeat]);

	const connect = useCallback(async () => {
		if (
			callState !== CallState.Idle &&
			callState !== CallState.Ended &&
			callState !== CallState.Failed
		) {
			console.log("[connect] Call already in progress, ignoring");
			return;
		}

		if (isConnectingRef.current) {
			console.log("[connect] Already connecting, ignoring duplicate call");
			return;
		}
		isConnectingRef.current = true;
		setIsStarting(true);

		try {
			setErrorMessage(null);

			if (!serverUrl) {
				const message = "Server not paired. Complete onboarding first.";
				setErrorMessage(message);
				broadcastSystemMessage(message, false);
				return;
			}

			if (!workerConnected) {
				const message = "No worker connected. Start your local worker first.";
				setErrorMessage(message);
				broadcastSystemMessage(message, false);
				return;
			}

			const tokenResponse = await fetchWithAuth({
				url: `${serverUrl}/session`,
				context: { getSession },
				options: {
					method: "POST",
					body: JSON.stringify({ voice: DEFAULT_VOICE }),
				},
			});

			const tokenData = await safeJson(tokenResponse);
			if (!tokenResponse.ok) {
				const message =
					tokenData?.error ||
					`Failed to get session token (status ${tokenResponse.status})`;
				setErrorMessage(message);
				broadcastSystemMessage(message, false);
				return;
			}
			if (!tokenData?.value) {
				const message = "No ephemeral key provided";
				setErrorMessage(message);
				broadcastSystemMessage(message, false);
				return;
			}

			pendingEphemeralKeyRef.current = tokenData.value;
			console.log("[connect] Got ephemeral key, starting native call...");

			await startCall("Bigwig", {
				apiKey: tokenData.value,
				model: "gpt-realtime",
				voice: DEFAULT_VOICE,
			});
			console.log("[connect] startCall() returned successfully");

			if (muteMicByDefault) {
				await setMuted(true);
			}

			isConnectingRef.current = false;
			setIsStarting(false);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			console.error("[connect] Connection error:", error);
			setErrorMessage(error.message || "Failed to connect");
			isConnectingRef.current = false;
			setIsStarting(false);
		}
	}, [
		callState,
		serverUrl,
		workerConnected,
		muteMicByDefault,
		setErrorMessage,
		broadcastSystemMessage,
		startCall,
		setMuted,
	]);

	const disconnect = useCallback(async () => {
		try {
			await endCall();
		} catch (e) {
			console.warn("[disconnect] Error ending call:", e);
		}
		const callId = pendingCallIdRef.current;
		const ephemeralKey = pendingEphemeralKeyRef.current;
		if (callId && ephemeralKey) {
			sendCallHeartbeat({ callId, ephemeralKey, active: false });
		}
		pendingEphemeralKeyRef.current = null;
		pendingCallIdRef.current = null;
		isConnectingRef.current = false;
		clearSidebandRetry();
	}, [endCall, clearSidebandRetry, sendCallHeartbeat]);

	const toggleMute = useCallback(async () => {
		await setMuted(!isMuted);
	}, [isMuted, setMuted]);

	const toggleSpeaker = useCallback(async () => {
		await setSpeakerEnabled(!isSpeakerEnabled);
	}, [isSpeakerEnabled, setSpeakerEnabled]);

	useEffect(() => {
		if (
			autoStartVoice &&
			authStatus === "authenticated" &&
			workerConnected &&
			callStatus === "idle" &&
			!hasAutoStartedRef.current
		) {
			hasAutoStartedRef.current = true;
			connect();
		}
	}, [autoStartVoice, authStatus, workerConnected, callStatus, connect]);

	useEffect(() => {
		if (!workerConnected) return;
		const callId = pendingCallIdRef.current;
		const ephemeralKey = pendingEphemeralKeyRef.current;
		if (callId && ephemeralKey) {
			attemptSidebandConnect(callId, ephemeralKey).then((ok) => {
				if (!ok) scheduleSidebandRetry(callId, ephemeralKey);
			});
		}
	}, [workerConnected, attemptSidebandConnect, scheduleSidebandRetry]);

	const value: CallContextValue = {
		callState,
		callStatus,
		isMuted,
		isSpeakerEnabled,
		isStarting,
		connect,
		disconnect,
		toggleMute,
		toggleSpeaker,
	};

	return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = () => {
	const context = useContext(CallContext);
	if (!context) {
		throw new Error("useCall must be used within a CallProvider");
	}
	return context;
};
