import { Platform } from "react-native";
import { RECONNECT_DELAYS } from "../constants/timeouts";
import type { AgentEvent } from "../types/tasks";

type EventsServiceConfig = {
	serverUrl: string;
	getSession: () => Promise<string | null>;
	getSessionId: () => string | null;
	setSessionId: (id: string) => void;
	getLastEventId: () => string | null;
	setLastEventId: (id: string) => void;
	onAgentEvent: (event: AgentEvent) => void;
	onWorkerStatus: (connected: boolean) => void;
	onSocketChange: (socket: WebSocket | null) => void;
	onConnectionEvent?: (event: {
		type: "open" | "close" | "error" | "reconnect";
		code?: number;
		reason?: string;
		message?: string;
		delayMs?: number;
	}) => void;
};

type EventsServiceHandle = {
	connect: () => Promise<void>;
	disconnect: () => void;
	setEnabled: (enabled: boolean) => void;
};

export const createEventsService = (
	config: EventsServiceConfig,
): EventsServiceHandle => {
	let ws: WebSocket | null = null;
	let reconnectAttempts = 0;
	let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	let enabled = false;

	const clearReconnectTimeout = () => {
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}
	};

	const scheduleReconnect = () => {
		if (!enabled) return;
		const delay =
			RECONNECT_DELAYS[
				Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1)
			];
		reconnectAttempts += 1;
		const sessionPreview = config.getSessionId()?.substring(0, 8) || "none";
		console.log(
			`[events] Reconnecting in ${delay}ms (session: ${sessionPreview})...`,
		);
		config.onConnectionEvent?.({ type: "reconnect", delayMs: delay });
		reconnectTimeout = setTimeout(connect, delay);
	};

	const clearHeartbeat = () => {
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}
	};

	const startHeartbeat = () => {
		clearHeartbeat();
		heartbeatInterval = setInterval(() => {
			if (!ws || ws.readyState !== WebSocket.OPEN) return;
			try {
				ws.send(JSON.stringify({ type: "heartbeat" }));
			} catch (err) {
				console.warn("[events] Heartbeat send failed:", err);
			}
		}, 25000);
	};

	const connect = async () => {
		if (ws) {
			ws.close();
			ws = null;
			config.onSocketChange(null);
		}

		const session = await config.getSession();
		const wsProtocol = config.serverUrl.startsWith("https") ? "wss" : "ws";
		const wsHost = config.serverUrl.replace(/^https?:\/\//, "");
		const params = new URLSearchParams();
		const sessionId = config.getSessionId();
		const lastEventId = config.getLastEventId();
		if (sessionId) params.set("session_id", sessionId);
		if (lastEventId) params.set("last_event_id", lastEventId);
		const query = params.toString();
		const url = `${wsProtocol}://${wsHost}/events${query ? `?${query}` : ""}`;
		const headers: Record<string, string> = {};
		if (session) {
			headers.Authorization = `Bearer ${session}`;
		}

		const protocols = session ? [`bearer.${session}`] : [];
		const socket = new WebSocket(url, protocols, { headers });
		ws = socket;
		config.onSocketChange(ws);

		socket.onopen = () => {
			console.log("[events] WebSocket connected");
			reconnectAttempts = 0;
			config.onConnectionEvent?.({ type: "open" });
			startHeartbeat();
		};

		socket.onmessage = (e) => {
			try {
				const event: AgentEvent = JSON.parse(e.data);
				if (event.type === "connected") {
					const sessionId = (event as { session_id?: string }).session_id;
					if (sessionId) {
						config.setSessionId(sessionId);
						console.log(`[events] Session ID: ${sessionId.substring(0, 8)}...`);
					}
					const workerStatus = (event as { worker_connected?: boolean })
						.worker_connected;
					if (typeof workerStatus === "boolean") {
						config.onWorkerStatus(workerStatus);
						console.log(`[events] Worker connected: ${workerStatus}`);
					}
				} else {
					if (Platform.OS === "ios" && event.type === "tool_use") {
						const inputPayload = event.input ? JSON.stringify(event.input) : "";
						console.log(
							`[events] tool_use name=${event.name} input=${inputPayload} task_id=${event.task_id} ts=${event.ts}`,
						);
					}
					config.onAgentEvent(event);
					const eventId = (event as { id?: string }).id;
					if (eventId) {
						config.setLastEventId(eventId);
					}
				}
			} catch (err) {
				const preview =
					typeof e.data === "string" ? e.data.slice(0, 200) : "[non-string]";
				console.error("[events] Failed to parse event:", preview, err);
			}
		};

		socket.onerror = (event) => {
			const message =
				typeof (event as { message?: unknown }).message === "string"
					? (event as { message: string }).message
					: "WebSocket error";
			console.error("[events] WebSocket error:", message);
			config.onConnectionEvent?.({
				type: "error",
				message,
			});
		};

		socket.onclose = (event) => {
			console.log("[events] WebSocket closed", event.code, event.reason);
			ws = null;
			config.onSocketChange(null);
			clearHeartbeat();
			config.onConnectionEvent?.({
				type: "close",
				code: event.code,
				reason: event.reason,
			});
			scheduleReconnect();
		};
	};

	const disconnect = () => {
		enabled = false;
		clearReconnectTimeout();
		clearHeartbeat();
		if (ws) {
			ws.close();
			ws = null;
			config.onSocketChange(null);
		}
	};

	const setEnabled = (value: boolean) => {
		enabled = value;
		if (!enabled) {
			clearReconnectTimeout();
			clearHeartbeat();
		}
	};

	return { connect, disconnect, setEnabled };
};
