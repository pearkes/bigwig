/**
 * Bridge client library for connecting to the Bigwig event bridge.
 */

import { readFileSync } from "node:fs";

const BRIDGE_URL = process.env.BIGWIG_BRIDGE_URL || "ws://127.0.0.1:9100";
const TASK_ID = process.env.BIGWIG_TASK_ID;
const TASK_ID_FILE = process.env.BIGWIG_TASK_ID_FILE;

interface BaseEvent {
	type: string;
	id?: string;
	ts?: number;
	task_id?: string;
	[key: string]: unknown;
}

function generateId(): string {
	return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowMs(): number {
	return Date.now();
}

function parseMessageData(data: unknown): string {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
	if (ArrayBuffer.isView(data))
		return Buffer.from(data.buffer).toString("utf8");
	return String(data ?? "");
}

function readTaskIdFromFile(): string | undefined {
	if (!TASK_ID_FILE) return undefined;
	try {
		const data = readFileSync(TASK_ID_FILE, "utf8").trim();
		return data || undefined;
	} catch {
		return undefined;
	}
}

// Shared connection for batch sending
let sharedWs: WebSocket | null = null;
let sharedWsReady = false;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function getConnection(): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}

		if (sharedWs && sharedWsReady) {
			resolve(sharedWs);
			return;
		}

		if (sharedWs) {
			try {
				sharedWs.close();
			} catch {
				// ignore
			}
			sharedWs = null;
			sharedWsReady = false;
		}

		console.log(`[bridge] Opening new connection to ${BRIDGE_URL}`);
		const ws = new WebSocket(BRIDGE_URL);
		sharedWs = ws;

		ws.addEventListener("open", () => {
			sharedWsReady = true;
			resolve(ws);
		});

		ws.addEventListener("error", (event) => {
			sharedWs = null;
			sharedWsReady = false;
			const message =
				typeof (event as { message?: unknown }).message === "string"
					? (event as { message: string }).message
					: String(event);
			reject(new Error(`Bridge connection failed: ${message}`));
		});

		ws.addEventListener("close", () => {
			sharedWs = null;
			sharedWsReady = false;
		});
	});
}

function scheduleClose(): void {
	if (closeTimer) clearTimeout(closeTimer);
	closeTimer = setTimeout(() => {
		if (sharedWs) {
			sharedWs.close();
			sharedWs = null;
			sharedWsReady = false;
		}
		closeTimer = null;
	}, 500);
}

export async function send(event: BaseEvent): Promise<void> {
	const fileTaskId = readTaskIdFromFile();
	const fullEvent = {
		...event,
		id: event.id || generateId(),
		ts: event.ts || nowMs(),
		task_id: event.task_id || TASK_ID || fileTaskId,
	};

	const ws = await getConnection();
	return new Promise((resolve, _reject) => {
		ws.send(JSON.stringify(fullEvent));
		scheduleClose();
		resolve();
	});
}

export async function sendAndWait<T extends { id?: string }>(
	event: BaseEvent,
	timeoutMs: number = 120000,
): Promise<T> {
	const eventId = event.id || generateId();
	const fileTaskId = readTaskIdFromFile();
	const fullEvent = {
		...event,
		id: eventId,
		ts: event.ts || nowMs(),
		task_id: event.task_id || TASK_ID || fileTaskId,
	};

	return new Promise((resolve, reject) => {
		const ws = new WebSocket(BRIDGE_URL);
		let resolved = false;

		const cleanup = () => {
			if (!resolved) {
				resolved = true;
				ws.close();
			}
		};

		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error("Timeout waiting for response"));
		}, timeoutMs);

		ws.addEventListener("open", () => {
			ws.send(JSON.stringify(fullEvent));
		});

		ws.addEventListener("message", (event) => {
			clearTimeout(timeout);
			try {
				const response = JSON.parse(
					parseMessageData((event as MessageEvent).data),
				) as T;
				if (response.id && response.id !== eventId) {
					cleanup();
					reject(
						new Error(
							`Response ID mismatch: expected ${eventId}, got ${response.id}`,
						),
					);
					return;
				}
				cleanup();
				resolve(response);
			} catch (err) {
				cleanup();
				reject(new Error(`Invalid response: ${err}`));
			}
		});

		ws.addEventListener("error", (event) => {
			clearTimeout(timeout);
			cleanup();
			const message =
				typeof (event as { message?: unknown }).message === "string"
					? (event as { message: string }).message
					: String(event);
			reject(new Error(`Bridge connection failed: ${message}`));
		});

		ws.addEventListener("close", () => {
			clearTimeout(timeout);
			if (!resolved) {
				resolved = true;
				reject(new Error("Bridge connection closed before response"));
			}
		});
	});
}
