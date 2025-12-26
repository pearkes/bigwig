/**
 * OpenAI CallKit Module
 *
 * TypeScript wrapper for the native OpenAICallKit module providing
 * voice call integration with OpenAI Realtime API via iOS CallKit.
 *
 * @example
 * ```tsx
 * import { startCall, endCall, useOpenAICall } from './modules/OpenAICallKit';
 * // Start a call
 * await startCall('AI Assistant', {
 *   apiKey: 'your-api-key',
 *   model: 'gpt-realtime',
 *   voice: 'alloy',
 * });
 *
 * // Or use the hook
 * function CallScreen() {
 *   const { callState, startCall, endCall, setMuted, isMuted } = useOpenAICall();
 *   // ...
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	type EmitterSubscription,
	NativeEventEmitter,
	NativeModules,
	Platform,
} from "react-native";

import type {
	CallErrorEvent,
	CallIdCallback,
	CallStateCallback,
	ErrorCallback,
	SessionConfig,
	UseOpenAICallReturn,
	WebRTCEventCallback,
} from "./OpenAICallKit.types";

export type {
	CallErrorEvent,
	CallIdEvent,
	CallStateChangeEvent,
	SessionConfig,
	UseOpenAICallReturn,
} from "./OpenAICallKit.types";
export { CallState } from "./OpenAICallKit.types";

const LINKING_ERROR =
	`The package 'OpenAICallKit' doesn't seem to be linked. Make sure: \n\n` +
	Platform.select({ ios: "- You have run 'pod install'\n", default: "" }) +
	"- You rebuilt the app after installing the package\n" +
	"- You are not using Expo Go (requires dev client)\n";

const isIOS = Platform.OS === "ios";

interface OpenAICallKitNativeModule {
	startCall(displayName: string, sessionConfig: SessionConfig): Promise<string>;
	endCall(): Promise<void>;
	setMuted(muted: boolean): Promise<void>;
	setSpeakerEnabled(enabled: boolean): Promise<void>;
	getCallState(): Promise<string>;
	sendDataChannelMessage(message: Record<string, unknown>): Promise<void>;
}

const NativeOpenAICallKit: OpenAICallKitNativeModule | null = isIOS
	? NativeModules.OpenAICallModule
	: null;

const nativeEventEmitter =
	isIOS && NativeOpenAICallKit
		? new NativeEventEmitter(NativeModules.OpenAICallModule)
		: null;

/**
 * Throws if the native module is not available.
 */
function requireNativeModule(): OpenAICallKitNativeModule {
	if (!NativeOpenAICallKit) {
		throw new Error(LINKING_ERROR);
	}
	return NativeOpenAICallKit;
}

/**
 * No-op function for unsupported platforms.
 */
function noop(): () => void {
	return () => {};
}

/**
 * Start an outgoing voice call with OpenAI Realtime API.
 *
 * @param displayName - Name shown in system call UI
 * @param sessionConfig - OpenAI Realtime API session configuration
 * @returns Promise that resolves when call is initiated
 *
 * @example
 * ```ts
 * await startCall('AI Assistant', {
 *   apiKey: ephemeralToken,
 *   model: 'gpt-realtime',
 *   voice: 'coral',
 *   instructions: 'You are a helpful assistant.',
 * });
 * ```
 */
export async function startCall(
	displayName: string,
	sessionConfig: SessionConfig,
): Promise<void> {
	if (!isIOS) {
		console.log("[OpenAICallKit] startCall not available on non-iOS platform");
		return;
	}
	const native = requireNativeModule();
	await native.startCall(displayName, sessionConfig);
}

/**
 * End the current call.
 *
 * @returns Promise that resolves when call is ended
 */
export async function endCall(): Promise<void> {
	if (!isIOS) {
		return;
	}
	const native = requireNativeModule();
	await native.endCall();
}

/**
 * Mute or unmute the microphone.
 *
 * @param muted - Whether to mute
 * @returns Promise that resolves when mute state is changed
 */
export async function setMuted(muted: boolean): Promise<void> {
	if (!isIOS) {
		return;
	}
	const native = requireNativeModule();
	await native.setMuted(muted);
}

/**
 * Get the current call state.
 *
 * @returns Promise resolving to current CallState
 */
export async function getCallState(): Promise<string> {
	if (!isIOS) {
		return "idle";
	}
	const native = requireNativeModule();
	return native.getCallState();
}

/**
 * Enable or disable speaker output.
 *
 * @param enabled - Whether to use speaker (true) or earpiece (false)
 * @returns Promise that resolves when audio route is changed
 */
export async function setSpeakerEnabled(enabled: boolean): Promise<void> {
	if (!isIOS) {
		return;
	}
	const native = requireNativeModule();
	await native.setSpeakerEnabled(enabled);
}

/**
 * Send a message through the WebRTC data channel.
 * Used to send function call results back to OpenAI Realtime API.
 *
 * @param message - JSON-serializable message object
 * @returns Promise that resolves when message is sent
 */
export async function sendDataChannelMessage(
	message: Record<string, unknown>,
): Promise<void> {
	if (!isIOS) {
		console.log(
			"[OpenAICallKit] sendDataChannelMessage not available on non-iOS platform",
		);
		return;
	}
	const native = requireNativeModule();
	await native.sendDataChannelMessage(message);
}

/**
 * Subscribe to call state changes.
 *
 * @param callback - Function called when call state changes
 * @returns Unsubscribe function
 *
 * @example
 * ```ts
 * const unsubscribe = addCallStateListener((event) => {
 *   console.log('Call state:', event.state);
 * });
 * // Later:
 * unsubscribe();
 * ```
 */
export function addCallStateListener(callback: CallStateCallback): () => void {
	if (!nativeEventEmitter) {
		return noop();
	}
	const subscription: EmitterSubscription = nativeEventEmitter.addListener(
		"onCallStateChange",
		callback,
	);
	return () => subscription.remove();
}

/**
 * Subscribe to call errors.
 *
 * @param callback - Function called when an error occurs
 * @returns Unsubscribe function
 */
export function addErrorListener(callback: ErrorCallback): () => void {
	if (!nativeEventEmitter) {
		return noop();
	}
	const subscription: EmitterSubscription = nativeEventEmitter.addListener(
		"onCallError",
		callback,
	);
	return () => subscription.remove();
}

/**
 * Subscribe to call ID events (received after WebRTC connection).
 * Needed for sideband worker connection.
 *
 * @param callback - Function called when call ID is received
 * @returns Unsubscribe function
 */
export function addCallIdListener(callback: CallIdCallback): () => void {
	if (!nativeEventEmitter) {
		return noop();
	}
	const subscription: EmitterSubscription = nativeEventEmitter.addListener(
		"onCallId",
		callback,
	);
	return () => subscription.remove();
}

/**
 * Subscribe to WebRTC data channel events (transcripts, responses, etc).
 *
 * @param callback - Function called for each data channel message
 * @returns Unsubscribe function
 */
export function addWebRTCEventListener(
	callback: WebRTCEventCallback,
): () => void {
	if (!nativeEventEmitter) {
		return noop();
	}
	const handler = (event: Record<string, unknown>) => {
		if (event?.type === "data_channel_info") {
			console.log("[OpenAICallKit] Data channel info:", event);
		}
		callback(event);
	};
	const subscription: EmitterSubscription = nativeEventEmitter.addListener(
		"onWebRTCEvent",
		handler,
	);
	return () => subscription.remove();
}

/**
 * React hook for managing OpenAI voice calls.
 * Provides reactive state and methods for call management.
 *
 * @returns Object with call state and methods
 *
 * @example
 * ```tsx
 * function CallScreen() {
 *   const {
 *     callState,
 *     isMuted,
 *     startCall,
 *     endCall,
 *     setMuted,
 *     error,
 *   } = useOpenAICall();
 *
 *   const handleCall = async () => {
 *     await startCall('AI Assistant', { apiKey, model, voice: 'alloy' });
 *   };
 *
 *   return (
 *     <View>
 *       <Text>State: {callState}</Text>
 *       <Button onPress={handleCall} title="Call" />
 *       <Button onPress={endCall} title="End" />
 *       <Button onPress={() => setMuted(!isMuted)} title={isMuted ? 'Unmute' : 'Mute'} />
 *     </View>
 *   );
 * }
 * ```
 */
export function useOpenAICall(): UseOpenAICallReturn {
	const [callState, setCallState] = useState<string>("idle");
	const [isMuted, setIsMuted] = useState(false);
	const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(false);
	const [error, setError] = useState<CallErrorEvent | null>(null);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;

		const unsubState = addCallStateListener((event) => {
			if (mountedRef.current) {
				setCallState(event.state);
				if (event.state === "idle") {
					setError(null);
				}
			}
		});

		const unsubError = addErrorListener((event) => {
			if (mountedRef.current) {
				setError(event);
			}
		});

		getCallState().then((state) => {
			if (mountedRef.current) {
				setCallState(state);
			}
		});

		return () => {
			mountedRef.current = false;
			unsubState();
			unsubError();
		};
	}, []);

	const handleStartCall = useCallback(
		async (displayName: string, sessionConfig: SessionConfig) => {
			setError(null);
			await startCall(displayName, sessionConfig);
		},
		[],
	);

	const handleEndCall = useCallback(async () => {
		await endCall();
	}, []);

	const handleSetMuted = useCallback(async (muted: boolean) => {
		await setMuted(muted);
		if (mountedRef.current) {
			setIsMuted(muted);
		}
	}, []);

	const handleSetSpeakerEnabled = useCallback(async (enabled: boolean) => {
		await setSpeakerEnabled(enabled);
		if (mountedRef.current) {
			setIsSpeakerEnabled(enabled);
		}
	}, []);

	return {
		callState: callState as UseOpenAICallReturn["callState"],
		isMuted,
		isSpeakerEnabled,
		error,
		startCall: handleStartCall,
		endCall: handleEndCall,
		setMuted: handleSetMuted,
		setSpeakerEnabled: handleSetSpeakerEnabled,
	};
}
