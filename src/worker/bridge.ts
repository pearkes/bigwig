import type { ServerWebSocket } from "bun";
import { BRIDGE_PORT } from "./config";

export type BridgeEventCallback = (event: Record<string, unknown>) => void;
export type TaskIdCallback = () => string | null | undefined;

type PendingEntry = {
	ws: ServerWebSocket<unknown>;
	timeoutId: ReturnType<typeof setTimeout>;
};

let eventCallback: BridgeEventCallback | null = null;
let taskIdCallback: TaskIdCallback | null = null;
let server: ReturnType<typeof Bun.serve> | null = null;

const pendingRequests = new Map<string, PendingEntry>();
const pendingByTask = new Map<string, string>();
const queuedEvents: Record<string, unknown>[] = [];

export function setEventCallback(callback: BridgeEventCallback | null): void {
	eventCallback = callback;
	if (eventCallback && queuedEvents.length > 0) {
		const queued = queuedEvents.splice(0, queuedEvents.length);
		for (const event of queued) {
			try {
				eventCallback(event);
			} catch (err) {
				console.log(`[bridge] Failed to deliver queued event: ${err}`);
			}
		}
	}
}

export function setTaskIdCallback(callback: TaskIdCallback | null): void {
	taskIdCallback = callback;
}

export async function deliverInputResponse(
	requestId: string,
	response: Record<string, unknown>,
): Promise<boolean> {
	const entry = pendingRequests.get(requestId);
	if (!entry) return false;

	pendingRequests.delete(requestId);
	for (const [taskId, rid] of pendingByTask.entries()) {
		if (rid === requestId) {
			pendingByTask.delete(taskId);
			break;
		}
	}

	clearTimeout(entry.timeoutId);

	try {
		if (entry.ws.readyState === 1) {
			entry.ws.send(JSON.stringify(response));
			return true;
		}
	} catch (err) {
		console.log(`[bridge] Failed to deliver response: ${err}`);
	}

	return false;
}

function scheduleTimeout(
	requestId: string,
	timeoutSeconds: number,
): ReturnType<typeof setTimeout> {
	return setTimeout(() => {
		const entry = pendingRequests.get(requestId);
		if (!entry) return;

		pendingRequests.delete(requestId);
		for (const [taskId, rid] of pendingByTask.entries()) {
			if (rid === requestId) {
				pendingByTask.delete(taskId);
				break;
			}
		}

		if (entry.ws.readyState === 1) {
			try {
				entry.ws.send(
					JSON.stringify({
						type: "input_response",
						id: requestId,
						cancelled: true,
						reason: "timeout",
					}),
				);
			} catch {
				// ignore
			}
		}
	}, timeoutSeconds * 1000);
}

function handleEvent(
	event: Record<string, unknown>,
	ws: ServerWebSocket<unknown>,
): void {
	const eventType = String(event.type || "");

	if (["input_request", "form_request", "file_request"].includes(eventType)) {
		const requestId = String(event.id || "");
		if (requestId) {
			let taskId = (event.task_id as string | undefined) || null;
			if (!taskId && taskIdCallback) {
				taskId = taskIdCallback();
			}

			if (taskId && pendingByTask.has(taskId)) {
				const existing = pendingByTask.get(taskId);
				console.log(
					`[bridge] Rejecting duplicate request for task ${taskId} (existing: ${existing})`,
				);
				ws.send(
					JSON.stringify({
						type: "input_response",
						id: requestId,
						cancelled: true,
						reason: `Task ${taskId} already has a pending input request. Wait for the user to respond before sending another.`,
					}),
				);
				return;
			}

			const timeoutSeconds = Number(event.timeout_seconds || 120);
			const timeoutId = scheduleTimeout(requestId, timeoutSeconds);
			pendingRequests.set(requestId, { ws, timeoutId });

			if (taskId) {
				pendingByTask.set(taskId, requestId);
				event = { ...event, task_id: taskId };
			}
		}
	}

	if (
		[
			"message",
			"file",
			"file_start",
			"file_chunk",
			"link",
			"code",
			"list",
			"progress",
			"error",
		].includes(eventType)
	) {
		if (!event.task_id && taskIdCallback) {
			const taskId = taskIdCallback();
			if (taskId) {
				event = { ...event, task_id: taskId };
			}
		}
	}

	if (eventCallback) {
		eventCallback(event);
	} else {
		queuedEvents.push(event);
		console.log(`[bridge] Queued event: ${eventType}`);
	}
}

function cleanupRequests(ws: ServerWebSocket<unknown>): void {
	for (const [requestId, entry] of pendingRequests.entries()) {
		if (entry.ws === ws) {
			clearTimeout(entry.timeoutId);
			pendingRequests.delete(requestId);
			for (const [taskId, rid] of pendingByTask.entries()) {
				if (rid === requestId) {
					pendingByTask.delete(taskId);
					break;
				}
			}
			console.log(`[bridge] Orphaned request ${requestId} cleaned up`);
		}
	}
}

export async function startBridge(): Promise<void> {
	if (server) return;

	server = Bun.serve({
		hostname: "127.0.0.1",
		port: BRIDGE_PORT,
		fetch(req, srv) {
			if (srv.upgrade(req)) return;
			return new Response("Bridge is WebSocket-only", { status: 426 });
		},
		websocket: {
			open(ws) {
				console.log(`[bridge] Connection from ${String(ws.remoteAddress)}`);
			},
			message(ws, message) {
				try {
					const payload =
						typeof message === "string"
							? message
							: new TextDecoder().decode(message);
					const event = JSON.parse(payload) as Record<string, unknown>;
					console.log(`[bridge] Received: ${String(event.type || "unknown")}`);
					handleEvent(event, ws);
				} catch {
					console.log("[bridge] Invalid JSON message");
				}
			},
			close(ws) {
				console.log(
					`[bridge] Connection closed from ${String(ws.remoteAddress)}`,
				);
				cleanupRequests(ws);
			},
		},
	});

	console.log(`[bridge] Started on ws://127.0.0.1:${BRIDGE_PORT}`);
}

export function getPendingRequestCount(): number {
	return pendingRequests.size;
}
