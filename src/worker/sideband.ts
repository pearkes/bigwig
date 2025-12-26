import { formatSystemMessage, formatWorkerMessage } from "../shared/broadcast";
import { sleep } from "../shared/utils";
import { getAgentPool } from "./agents/manager";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 5000];
const DEDUP_WINDOW_SECONDS = 5;
const ASSISTANT_BROADCAST_WINDOW_MS = 2000;
const SYSTEM_NOTICE_COOLDOWN_MS = 30000;

const lastSystemNoticeByCall = new Map<
	string,
	{ connectedAt?: number; disconnectedAt?: number }
>();

const TOOL_DEFINITIONS = [
	{
		type: "function",
		name: "run_task",
		description:
			"Start a task - research, writing, coding, file operations, running commands, anything. Runs asynchronously. Returns task_id for tracking.",
		parameters: {
			type: "object",
			properties: {
				task: {
					type: "string",
					description: "What to do, in plain language",
				},
			},
			required: ["task"],
		},
	},
	{
		type: "function",
		name: "get_tasks",
		description:
			"List all running and recently completed tasks with their task_id, status, and details. Use to check on concurrent tasks.",
		parameters: {
			type: "object",
			properties: {},
		},
	},
	{
		type: "function",
		name: "cancel_task",
		description:
			"Cancel a running task. If task_id is provided, cancels that specific task. Otherwise cancels the most recent task.",
		parameters: {
			type: "object",
			properties: {
				task_id: {
					type: "string",
					description:
						"Optional task_id to cancel a specific task (from run_task result or get_tasks)",
				},
			},
		},
	},
	{
		type: "function",
		name: "update_task",
		description:
			"Send additional input or corrections to a running task. Use when the user wants to add info, clarify, or redirect the current work without cancelling it. The message interrupts and updates the running task.",
		parameters: {
			type: "object",
			properties: {
				message: {
					type: "string",
					description:
						"The update, clarification, or additional info to send to the running task",
				},
				task_id: {
					type: "string",
					description:
						"Optional task_id to update a specific task. Otherwise updates the most recent task.",
				},
				title: {
					type: "string",
					description:
						"Optional new title for the task card shown to the user. Use when the task goal changes (e.g., 'Get weather in Los Angeles' instead of 'Get weather in New York').",
				},
			},
			required: ["message"],
		},
	},
];

type RealtimeConnection = {
	send?: (payload: unknown) => Promise<void> | void;
	[Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

function connectionSupportsAsyncIterator(
	connection: RealtimeConnection,
): connection is Required<RealtimeConnection> {
	return typeof connection[Symbol.asyncIterator] === "function";
}

async function sendEvent(
	connection: RealtimeConnection,
	event: Record<string, unknown>,
): Promise<void> {
	if (typeof connection.send === "function") {
		try {
			await connection.send(event);
		} catch {
			await connection.send(JSON.stringify(event));
		}
		return;
	}
	throw new Error("Realtime connection does not support send().");
}

function _stringifyEvent(event: unknown): string {
	try {
		return JSON.stringify(sanitizeEventForLogs(event));
	} catch (err) {
		return `{"error":"failed_to_stringify","message":"${String((err as Error).message || err)}"}`;
	}
}

function sanitizeEventForLogs(value: unknown, depth = 0): unknown {
	if (depth > 6) return "[truncated]";
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeEventForLogs(item, depth + 1));
	}

	const obj = value as Record<string, unknown>;
	const eventType = typeof obj.type === "string" ? obj.type : "";
	if (eventType?.includes("transcript")) {
		return "[filtered transcript event]";
	}
	const output: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(obj)) {
		const lowered = key.toLowerCase();
		if (key === "logprobs") continue;
		if (key === "bytes") {
			output[key] = "[filtered]";
			continue;
		}
		if (lowered.includes("transcript") || lowered.includes("transcription")) {
			output[key] = "[filtered]";
			continue;
		}
		output[key] = sanitizeEventForLogs(val, depth + 1);
	}
	return output;
}

function isAllowedRealtimeEvent(type: string): boolean {
	const allowlist = new Set([
		"response.function_call_arguments.done",
		"response.output_item.done",
		"conversation.item.done",
		"tool_use",
	]);
	return allowlist.has(type);
}

function formatAllowedEvent(event: Record<string, unknown>): string | null {
	const type = typeof event.type === "string" ? event.type : "";
	if (!type || !isAllowedRealtimeEvent(type)) return null;

	if (type === "response.function_call_arguments.done") {
		const name = String(event.name || "");
		const args = String(event.arguments || "");
		if (name !== "run_task") return `[tool] ${name}`;
		let task = args;
		try {
			const parsed = JSON.parse(args || "{}") as { task?: string };
			if (parsed.task) task = parsed.task;
		} catch {
			// ignore parse failures
		}
		return `[task] ${task}`;
	}

	if (type === "tool_use") {
		const name = String(event.name || "");
		const input = String(event.input || "");
		return `[tool] ${name}${input ? `: ${input}` : ""}`;
	}

	const item = (event.item as Record<string, unknown>) || {};
	const role = String(item.role || "");
	const content = Array.isArray(item.content) ? item.content : [];
	if (!content.length) return null;

	const textParts = content
		.map((part) => {
			if (!part || typeof part !== "object") return null;
			const partObj = part as Record<string, unknown>;
			if (partObj.type === "input_text" || partObj.type === "output_text") {
				return String(partObj.text || "");
			}
			return null;
		})
		.filter((text) => text && text.length > 0);

	if (textParts.length === 0) return null;

	const prefix = role === "assistant" ? "[assistant]" : "[user]";
	return `${prefix} ${textParts.join(" ")}`;
}

function stringifyToolInput(input: unknown): string {
	if (input === null || input === undefined) return "";
	if (typeof input === "string") return input;
	try {
		return JSON.stringify(input);
	} catch {
		return String(input);
	}
}

function formatToolCallText(name: string, input: unknown): string {
	const argText = stringifyToolInput(input);
	if (name === "send_markdown") {
		return argText ? `${name}(${argText})` : `${name}()`;
	}
	const preview =
		argText.length > 200 ? `${argText.slice(0, 200)}...` : argText;
	return preview ? `${name}(${preview})` : `${name}()`;
}

export async function broadcastWorkerMessage(
	connection: RealtimeConnection,
	message: string,
	taskId?: string,
	triggerResponse = false,
): Promise<void> {
	const text = formatWorkerMessage(message, taskId);

	await sendEvent(connection, {
		type: "conversation.item.create",
		item: {
			type: "message",
			role: "user",
			content: [{ type: "input_text", text }],
		},
	});

	if (triggerResponse) {
		await sendEvent(connection, { type: "response.create" });
	}
}

async function broadcastSystemMessage(
	connection: RealtimeConnection,
	message: string,
	triggerResponse = false,
): Promise<void> {
	const text = formatSystemMessage(message);

	await sendEvent(connection, {
		type: "conversation.item.create",
		item: {
			type: "message",
			role: "user",
			content: [{ type: "input_text", text }],
		},
	});

	if (triggerResponse) {
		await sendEvent(connection, { type: "response.create" });
	}
}

async function createRealtimeConnection(
	callId: string,
	apiKey: string,
): Promise<RealtimeConnection> {
	return createRawRealtimeConnection(callId, apiKey);
}

class AsyncQueue<T> {
	private items: T[] = [];
	private resolvers: Array<(value: T) => void> = [];

	push(item: T) {
		const resolver = this.resolvers.shift();
		if (resolver) {
			resolver(item);
		} else {
			this.items.push(item);
		}
	}

	shift(): Promise<T> {
		const item = this.items.shift();
		if (item !== undefined) return Promise.resolve(item);
		return new Promise((resolve) => this.resolvers.push(resolve));
	}
}

class RawRealtimeConnection implements RealtimeConnection {
	private ws: WebSocket;
	private queue = new AsyncQueue<unknown>();

	constructor(ws: WebSocket) {
		this.ws = ws;
		this.ws.addEventListener("message", (event) => {
			try {
				const data =
					typeof event.data === "string"
						? event.data
						: Buffer.from(event.data as ArrayBuffer).toString();
				const parsed = JSON.parse(data);
				this.queue.push(parsed);
			} catch {
				// Ignore invalid JSON
			}
		});
		this.ws.addEventListener("close", () => {
			this.closed = true;
			this.queue.push({ type: "session.ended" });
		});
	}

	async send(payload: unknown): Promise<void> {
		const message =
			typeof payload === "string" ? payload : JSON.stringify(payload);
		this.ws.send(message);
	}

	[Symbol.asyncIterator](): AsyncIterator<unknown> {
		return {
			next: async () => {
				const value = await this.queue.shift();
				return { done: false, value };
			},
		};
	}
}

async function createRawRealtimeConnection(
	callId: string,
	apiKey: string,
): Promise<RealtimeConnection> {
	const url = `wss://api.openai.com/v1/realtime?call_id=${callId}`;
	const ws = new WebSocket(url, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"OpenAI-Beta": "realtime=v1",
		},
	});

	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Realtime WebSocket connection timeout")),
			10000,
		);
		ws.addEventListener("open", () => {
			clearTimeout(timeout);
			resolve();
		});
		ws.addEventListener("error", () => {
			clearTimeout(timeout);
			reject(new Error("Realtime WebSocket connection error"));
		});
	});

	return new RawRealtimeConnection(ws);
}

export async function connectSideband(
	callId: string,
	ephemeralKey: string,
): Promise<void> {
	for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
		try {
			await runSidebandSession(callId, ephemeralKey);
			return;
		} catch (err) {
			const message = String((err as Error).message || err);
			if (attempt < MAX_RETRIES - 1) {
				const delay = RETRY_DELAYS[attempt];
				console.log(
					`[sideband] Connection failed, retrying in ${delay}ms: ${message}`,
				);
				await sleep(delay);
			} else {
				console.log(
					`[sideband] Connection failed after ${MAX_RETRIES} attempts: ${message}`,
				);
				throw err;
			}
		}
	}
}

function shouldSendSystemNotice(
	callId: string,
	kind: "connected" | "disconnected",
): boolean {
	const now = Date.now();
	const record = lastSystemNoticeByCall.get(callId) || {};
	const lastTs =
		kind === "connected" ? record.connectedAt : record.disconnectedAt;
	if (lastTs && now - lastTs < SYSTEM_NOTICE_COOLDOWN_MS) return false;
	if (kind === "connected") {
		record.connectedAt = now;
	} else {
		record.disconnectedAt = now;
	}
	lastSystemNoticeByCall.set(callId, record);
	return true;
}

async function runSidebandSession(
	callId: string,
	ephemeralKey: string,
): Promise<void> {
	await sleep(500);
	console.log(`[sideband] Starting session for call ${callId}`);

	const connection = await createRealtimeConnection(callId, ephemeralKey);

	await sendEvent(connection, {
		type: "session.update",
		session: {
			type: "realtime",
			tools: TOOL_DEFINITIONS,
			tool_choice: "auto",
		},
	});
	if (shouldSendSystemNotice(callId, "connected")) {
		await broadcastSystemMessage(
			connection,
			"Worker connected. Tools enabled.",
		);
	}

	const pendingTasks = new Set<Promise<void>>();
	let recentTasks = new Map<string, number>();

	if (!connectionSupportsAsyncIterator(connection)) {
		throw new Error(
			"Realtime connection does not support async iteration. Consider raw WebSocket fallback.",
		);
	}

	try {
		for await (const event of connection) {
			const evt = isRecord(event) ? event : {};
			const evtType = typeof evt.type === "string" ? evt.type : "";
			const formatted = evtType
				? formatAllowedEvent(evt as Record<string, unknown>)
				: null;
			if (formatted) {
				console.log(`[sideband] ${formatted}`);
				if (evtType !== "response.function_call_arguments.done") {
					continue;
				}
			}
			if (evtType.includes("transcript")) {
				continue;
			}
			if (evtType === "error") {
				console.log(
					`[sideband] API error: ${JSON.stringify(evt.error || evt)}`,
				);
				continue;
			}

			if (evtType === "response.function_call_arguments.done") {
				const evtName = typeof evt.name === "string" ? evt.name : "";
				const callId = typeof evt.call_id === "string" ? evt.call_id : "";
				const argsRaw =
					typeof evt.arguments === "string" ? evt.arguments : "{}";
				let args: Record<string, unknown> = {};
				let taskDesc = "";
				try {
					args = JSON.parse(argsRaw);
					taskDesc =
						typeof args.task === "string" ? args.task.slice(0, 100) : "";
				} catch {
					taskDesc = String(argsRaw || "").slice(0, 100);
				}

				if (evtName === "run_task") {
					const now = Date.now() / 1000;
					recentTasks = new Map(
						Array.from(recentTasks.entries()).filter(
							([, ts]) => now - ts < DEDUP_WINDOW_SECONDS,
						),
					);

					if (recentTasks.has(taskDesc)) {
						console.log(
							`[sideband] Duplicate run_task rejected: ${taskDesc.slice(0, 50)}...`,
						);
						await sendEvent(connection, {
							type: "conversation.item.create",
							item: {
								type: "function_call_output",
								call_id: evt.call_id,
								output: JSON.stringify({
									error: "Task already running",
									task: taskDesc,
								}),
							},
						});
						continue;
					}
					recentTasks.set(taskDesc, now);
				}

				if (!evtName || !callId) {
					console.log("[sideband] Tool call missing name/call_id, skipping");
					continue;
				}

				console.log(`[sideband] Tool call: ${evtName}`);
				console.log(`[sideband]   Task: ${taskDesc}...`);

				const taskPromise = handleToolCall(connection, {
					name: evtName,
					call_id: callId,
					arguments: argsRaw,
				}).catch((err) => {
					console.log(`[sideband] Handler error: ${err}`);
				});
				pendingTasks.add(taskPromise);
				taskPromise.finally(() => pendingTasks.delete(taskPromise));
			}

			if (evtType === "session.ended") {
				console.log("[sideband] Session ended");
				break;
			}
		}
	} finally {
		try {
			if (shouldSendSystemNotice(callId, "disconnected")) {
				await broadcastSystemMessage(
					connection,
					"Worker disconnected. Tools unavailable.",
				);
			}
		} catch {
			// ignore if connection already closed
		}
		if (pendingTasks.size > 0) {
			await Promise.allSettled(Array.from(pendingTasks));
		}

		const pool = getAgentPool();
		await pool.stopAll();

		console.log(`[sideband] Disconnected from ${callId}`);
	}
}

async function handleToolCall(
	connection: RealtimeConnection,
	event: { name: string; call_id: string; arguments?: string },
): Promise<void> {
	const start = Date.now();
	const pool = getAgentPool();

	let inputData: unknown = event.arguments;
	try {
		inputData = JSON.parse(event.arguments || "{}");
	} catch {
		// ignore
	}

	let result = "";

	try {
		const toolName = event.name as string;

		if (toolName === "get_tasks") {
			const status = pool.getStatus();
			result = JSON.stringify(status, null, 2);
			console.log(`[sideband] get_tasks: ${JSON.stringify(status)}`);
		} else if (toolName === "cancel_task") {
			const args = isRecord(inputData) ? inputData : {};
			const taskId =
				typeof args.task_id === "string" ? args.task_id : undefined;
			const cancelResult = await pool.cancel(taskId);
			result = JSON.stringify({ task_id: taskId, result: cancelResult });
			console.log(`[sideband] cancel_task: ${cancelResult}`);
		} else if (toolName === "update_task") {
			const args = isRecord(inputData) ? inputData : {};
			const message = typeof args.message === "string" ? args.message : "";
			const taskId =
				typeof args.task_id === "string" ? args.task_id : undefined;
			const title = typeof args.title === "string" ? args.title : undefined;
			const updateResult = await pool.update(taskId, message, title);
			result = JSON.stringify({ task_id: taskId, result: updateResult });
			console.log(`[sideband] update_task: ${updateResult}`);
		} else if (toolName === "run_task") {
			const args = isRecord(inputData) ? inputData : {};
			const taskPrompt =
				typeof args.task === "string"
					? args.task
					: typeof event.arguments === "string"
						? event.arguments
						: "";
			console.log(`[sideband] run_task: ${String(taskPrompt).slice(0, 50)}...`);
			await broadcastWorkerMessage(
				connection,
				`Working on: ${String(taskPrompt).slice(0, 200)}`,
			);

			let taskId: string | null = null;
			let taskStatus = "completed";
			let durationMs = 0;
			let outputText = "";
			let assistantBuffer = "";
			let lastAssistantBroadcast = "";
			let lastAssistantBroadcastTs = 0;
			let lastToolUpdate = "";
			let lastToolUpdateTs = 0;

			for await (const chunk of pool.execute(String(taskPrompt))) {
				if (isRecord(chunk) && typeof chunk.task_id === "string" && !taskId) {
					taskId = chunk.task_id;
				}
				const chunkType =
					isRecord(chunk) && typeof chunk.type === "string" ? chunk.type : "";
				if (chunkType === "tool_use") {
					const toolNameValue =
						isRecord(chunk) && typeof chunk.name === "string"
							? chunk.name
							: "unknown";
					const toolInput = stringifyToolInput(
						isRecord(chunk) ? chunk.input : undefined,
					);
					const toolUpdate = `${toolNameValue}:${toolInput}`;
					const nowMs = Date.now();
					const isDuplicate =
						toolUpdate === lastToolUpdate &&
						nowMs - lastToolUpdateTs < ASSISTANT_BROADCAST_WINDOW_MS;
					if (!isDuplicate) {
						lastToolUpdate = toolUpdate;
						lastToolUpdateTs = nowMs;
						await broadcastWorkerMessage(
							connection,
							`Tool use: ${formatToolCallText(toolNameValue, toolInput)}`,
							taskId ?? undefined,
						);
					}
				} else if (chunkType === "delta") {
					const deltaText =
						isRecord(chunk) && typeof chunk.text === "string" ? chunk.text : "";
					if (deltaText) {
						if (!assistantBuffer) {
							assistantBuffer = deltaText;
						} else if (deltaText.startsWith(assistantBuffer)) {
							assistantBuffer = deltaText;
						} else {
							assistantBuffer += deltaText;
						}
					}
					const nowMs = Date.now();
					const isDuplicate =
						assistantBuffer &&
						assistantBuffer === lastAssistantBroadcast &&
						nowMs - lastAssistantBroadcastTs < ASSISTANT_BROADCAST_WINDOW_MS;
					if (
						assistantBuffer &&
						!isDuplicate &&
						nowMs - lastAssistantBroadcastTs > 750
					) {
						lastAssistantBroadcast = assistantBuffer;
						lastAssistantBroadcastTs = nowMs;
						await broadcastWorkerMessage(
							connection,
							`Assistant: ${assistantBuffer.slice(0, 400)}`,
							taskId ?? undefined,
						);
					}
				}
				if (chunkType === "done") {
					outputText =
						isRecord(chunk) && typeof chunk.text === "string" ? chunk.text : "";
					durationMs = Number(
						isRecord(chunk) && typeof chunk.duration_ms === "number"
							? chunk.duration_ms
							: 0,
					);
					console.log(`[sideband] amp finished in ${durationMs}ms`);
				} else if (chunkType === "error") {
					const errorText =
						isRecord(chunk) && typeof chunk.error === "string"
							? chunk.error
							: String(isRecord(chunk) ? (chunk.error ?? "") : "");
					outputText = `Error: ${errorText}`;
					taskStatus = "error";
					console.log(`[sideband] amp error: ${errorText}`);
				} else if (chunkType === "cancelled") {
					outputText = "Task was cancelled";
					taskStatus = "cancelled";
					console.log("[sideband] amp cancelled");
				}
			}

			result = JSON.stringify({
				task_id: taskId,
				status: taskStatus,
				duration_ms: durationMs,
				result: outputText,
			});
			if (taskStatus === "completed") {
				await broadcastWorkerMessage(
					connection,
					`Finished task${taskId ? ` ${taskId}` : ""}: ${outputText.slice(0, 200)}`,
					taskId ?? undefined,
				);
			}
		} else {
			result = `Unknown tool: ${toolName}`;
		}

		const preview = result.length > 200 ? `${result.slice(0, 200)}...` : result;
		console.log(`[sideband]   Result: ${preview}`);

		await sendEvent(connection, {
			type: "conversation.item.create",
			item: {
				type: "function_call_output",
				call_id: event.call_id,
				output: result,
			},
		});

		try {
			await sendEvent(connection, { type: "response.create" });
			console.log(
				`[sideband] Response triggered, total ${(Date.now() - start) / 1000}s`,
			);
		} catch (err) {
			const message = String((err as Error).message || err);
			if (message.includes("already_has_active_response")) {
				console.log("[sideband] Response already active, skipping create");
			} else {
				throw err;
			}
		}
	} catch (err) {
		console.log(`[sideband] Handler error: ${err}`);
		try {
			await sendEvent(connection, {
				type: "conversation.item.create",
				item: {
					type: "function_call_output",
					call_id: event.call_id,
					output: `Error: ${String((err as Error).message || err)}`,
				},
			});
			await sendEvent(connection, { type: "response.create" });
		} catch {
			// ignore
		}
	}
}
