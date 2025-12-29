import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha512 } from "@noble/hashes/sha512";
import { getEnv, loadEnv } from "../shared/env";
import { debug, expandHome, sleep } from "../shared/utils";
import { getToolDocs } from "../tools/registry";
import { askUserFromBridge } from "./agents/ask_user";
import { addAgentEventListener } from "./agents/events";
import { getAgentPlugin, getAgentPool } from "./agents/manager";
import {
	deliverInputResponse,
	setEventCallback,
	setTaskIdCallback,
	startBridge,
} from "./bridge";
import {
	MAX_CHUNK_SIZE,
	MAX_PENDING_UPLOADS,
	RECONNECT_DELAY_MS,
	setWorkspaceDir,
	UPLOAD_TIMEOUT_SECONDS,
	WORKSPACE_DIR,
} from "./config";
import { loadWorkerCredentials, saveWorkerCredentials } from "./credentials";
import { writeEmbeddedSkillsToDir } from "./embedded_skills";
import { connectSideband } from "./sideband";
import { initWorkspace } from "./sync_tools";

loadEnv();

export const WORKER_HELP = [
	"Usage: bigwig worker [options]",
	"",
	"Options:",
	"  join --token <token> --server <url>  Pair worker and store credentials",
	"  --connect <url>                      Worker server URL (default: ws://localhost:8080/worker)",
	"  --workspace-dir <dir>                Workspace path (default: current directory)",
	"  --agent <name>                       Agent plugin to use (default: amp)",
	"  --help, -h                           Show this help",
].join("\n");

export function printWorkerUsage(): void {
	console.log(WORKER_HELP);
}

type PendingUpload = {
	request_id: string;
	name: string;
	mime: string;
	size: number;
	total_chunks: number;
	chunks: Map<number, string>;
	started_at: number;
};

const pendingUploads = new Map<string, PendingUpload>();
let activeCallId: string | null = null;

function bytesToBase64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function randomBytes(count: number): Uint8Array {
	const bytes = new Uint8Array(count);
	crypto.getRandomValues(bytes);
	return bytes;
}

async function getEd25519() {
	const ed25519 = await import("@noble/ed25519");
	ed25519.etc.sha512Sync = sha512;
	ed25519.etc.sha512Async = async (msg) => sha512(msg);
	return ed25519;
}

function toHttpUrl(wsUrl: string): string {
	const url = new URL(wsUrl);
	url.protocol = url.protocol === "wss:" ? "https:" : "http:";
	url.pathname = url.pathname.replace(/\/worker$/, "");
	return url.toString().replace(/\/$/, "");
}

function toWsUrl(serverUrl: string): string {
	const url = new URL(serverUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.pathname = "/worker";
	return url.toString();
}

function getArgValue(args: string[], name: string): string | null {
	const idx = args.indexOf(name);
	if (idx >= 0) {
		const value = args[idx + 1];
		if (!value || value.startsWith("--")) return null;
		return value;
	}
	const prefix = `${name}=`;
	for (const arg of args) {
		if (arg.startsWith(prefix)) return arg.slice(prefix.length);
	}
	return null;
}

function applyWorkspaceDir(args: string[]): void {
	const workspaceDirArg = getArgValue(args, "--workspace-dir");
	if (!workspaceDirArg) return;
	setWorkspaceDir(workspaceDirArg);
	process.env.WORKSPACE_DIR = workspaceDirArg;
}

function sanitizeFilename(name: string): string {
	const sanitized = name.replace(/[\\/\0]/g, "_");
	const safe = sanitized
		.split("")
		.filter((char) => /[a-zA-Z0-9._-]/.test(char))
		.join("");
	const trimmed = safe.replace(/^[.-]+/, "");
	return trimmed.slice(0, 100) || "file";
}

async function finalizeUpload(
	fileId: string,
	pending: PendingUpload,
): Promise<void> {
	const { request_id, name, mime, total_chunks } = pending;
	try {
		const missing: number[] = [];
		for (let i = 0; i < total_chunks; i += 1) {
			if (!pending.chunks.has(i)) missing.push(i);
		}
		if (missing.length > 0) {
			throw new Error(`Missing chunks: ${missing.join(", ")}`);
		}

		const chunks: string[] = [];
		for (let i = 0; i < total_chunks; i += 1) {
			chunks.push(pending.chunks.get(i) || "");
		}
		const fullBase64 = chunks.join("");
		const fileData = Buffer.from(fullBase64, "base64");

		const workspaceDir = expandHome(getEnv("WORKSPACE_DIR", WORKSPACE_DIR));
		const uploadDir = join(workspaceDir, "uploads", request_id);
		await mkdir(uploadDir, { recursive: true });

		const safeName = sanitizeFilename(name);
		const filePath = join(uploadDir, safeName);
		await Bun.write(filePath, fileData);

		console.log(
			`[worker] Upload complete: ${filePath} (${fileData.length} bytes)`,
		);

		const response = {
			type: "file_response",
			id: request_id,
			file_path: filePath,
			original_name: name,
			mime_type: mime,
			size: fileData.length,
		};
		const delivered = await deliverInputResponse(request_id, response);
		console.log(
			`[worker] File response for ${request_id}: ${delivered ? "delivered" : "no pending request"}`,
		);
	} catch (err) {
		console.log(`[worker] Upload finalize error: ${err}`);
		await deliverInputResponse(request_id, {
			type: "file_response",
			id: request_id,
			cancelled: true,
			reason: `error: ${String(err)}`,
		});
	} finally {
		pendingUploads.delete(fileId);
	}
}

function cleanupStaleUploads(): void {
	const now = Date.now() / 1000;
	for (const [fileId, pending] of pendingUploads.entries()) {
		if (now - pending.started_at > UPLOAD_TIMEOUT_SECONDS) {
			pendingUploads.delete(fileId);
			console.log(`[worker] Stale upload cleaned up: ${fileId}`);
		}
	}
}

async function joinWorker(args: string[]): Promise<void> {
	applyWorkspaceDir(args);
	const token = getArgValue(args, "--token") ?? "";
	const serverArg = getArgValue(args, "--server");
	const connectArg = getArgValue(args, "--connect");
	const wsUrl = connectArg ? connectArg : "";
	let serverUrl = "";
	if (serverArg) {
		serverUrl = serverArg;
	} else if (wsUrl) {
		serverUrl = toHttpUrl(wsUrl);
	}

	if (!token) {
		console.log("[worker] Error: join token required (--token)");
		return;
	}
	if (!serverUrl) {
		console.log("[worker] Error: server URL required (--server or --connect)");
		return;
	}

	const { getPublicKey } = await getEd25519();
	const privateKey = randomBytes(32);
	const publicKey = await getPublicKey(privateKey);
	const publicKeyEncoded = bytesToBase64Url(publicKey);

	const res = await fetch(`${serverUrl}/worker/join`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			join_token: token,
			worker_public_key: publicKeyEncoded,
		}),
	});

	const body = await res.json();
	if (!res.ok) {
		console.log(`[worker] Join failed: ${body.error || res.statusText}`);
		return;
	}

	const credential = String(body.credential || "");
	const workerId = String(body.worker_id || "");
	if (!credential || !workerId) {
		console.log("[worker] Join failed: missing credential or worker_id");
		return;
	}

	await saveWorkerCredentials({
		server_url: serverUrl,
		worker_id: workerId,
		credential,
		public_key: publicKeyEncoded,
		private_key: bytesToBase64Url(privateKey),
	});

	console.log(`[worker] Joined successfully as ${workerId}`);
}

export const __test__ = {
	sanitizeFilename,
	finalizeUpload,
	cleanupStaleUploads,
	pendingUploads,
	getEd25519,
};

async function getWorkspaceInfo(): Promise<Record<string, unknown>> {
	const skills: string[] = [];
	let info: Record<string, unknown> = {};
	let recent_tasks: Array<{ message: string; relative_time: string }> = [];

	const infoPath = join(WORKSPACE_DIR, "BIGWIG.md");
	try {
		const raw = await readFile(infoPath, "utf8");
		const trimmed = raw.trim();
		if (trimmed) {
			info = { user_markdown: trimmed };
		}
	} catch {
		// ignore
	}

	const agent = getAgentPlugin();
	if (agent.listSkills) {
		try {
			const listed = await agent.listSkills(WORKSPACE_DIR);
			skills.push(...listed);
		} catch (err) {
			console.log(`[worker] Failed to list skills: ${err}`);
		}
	}

	if (agent.getSessions) {
		try {
			const sessions = await agent.getSessions(5);
			recent_tasks = sessions.map((s) => ({
				message: stripTaskIds(s.title),
				relative_time: s.relative_time,
			}));
		} catch (err) {
			console.log(`[worker] Failed to get sessions: ${err}`);
		}
	}

	return { skills, info, recent_tasks };
}

function stripTaskIds(title: string): string {
	const cleaned = title
		.replace(/\bT-[A-Za-z0-9-]+\b/g, "")
		.replace(/\s{2,}/g, " ")
		.trim();
	return cleaned || "Previous session";
}

async function initAgentWorkspace(): Promise<void> {
	const agent = getAgentPlugin();
	const embeddedSkills = agent.embeddedSkills;
	const skillsDir = embeddedSkills
		? join(WORKSPACE_DIR, embeddedSkills.dir)
		: join(WORKSPACE_DIR, "skills");

	if (agent.hooks.authenticate) {
		const auth = await agent.hooks.authenticate({
			workspaceDir: WORKSPACE_DIR,
			askUser: askUserFromBridge,
			hasEnvVar: (name) => Boolean(process.env[name]),
		});
		if (!auth.success) {
			throw new Error(
				`Auth failed for ${agent.name}: ${auth.error || "unknown error"}`,
			);
		}
		console.log(
			`[worker] Authenticated with ${agent.name} via ${auth.method || "unknown"}`,
		);
	}

	if (embeddedSkills) {
		await writeEmbeddedSkillsToDir(skillsDir, {
			filter: embeddedSkills.filterPrefix
				? (file) => file.path.startsWith(embeddedSkills.filterPrefix || "")
				: undefined,
			stripPrefix: embeddedSkills.stripPrefix,
		});
	}

	if (agent.hooks.setup) {
		await agent.hooks.setup({
			workspaceDir: WORKSPACE_DIR,
			skillsDir,
			toolDocs: getToolDocs(),
		});
	}
}

async function handleMessage(
	ws: WebSocket,
	data: Record<string, unknown>,
): Promise<void> {
	const type = String(data.type || "");

	if (type === "connected") {
		console.log(`[worker] Registered as ${String(data.worker_id || "")}`);
		ws.send(JSON.stringify({ type: "request_active_call" }));
		return;
	}

	if (type === "connect_call") {
		const callId = String(data.call_id || "");
		const ephemeralKey = String(data.ephemeral_key || "");
		if (callId && ephemeralKey) {
			if (activeCallId === callId) {
				console.log(`[worker] Already connected to call ${callId}, skipping`);
				return;
			}
			activeCallId = callId;
			console.log(`[worker] Joining call ${callId}`);
			void connectSideband(callId, ephemeralKey);
		} else {
			console.log("[worker] Invalid connect_call message");
		}
		return;
	}

	if (type === "input_response") {
		const requestId = String(data.id || "");
		if (requestId) {
			const delivered = await deliverInputResponse(
				requestId,
				data as Record<string, unknown>,
			);
			console.log(
				`[worker] Input response for ${requestId}: ${delivered ? "delivered" : "no pending request"}`,
			);
		}
		return;
	}

	if (type === "cancel_task") {
		const pool = getAgentPool();
		const taskId = data.task_id ? String(data.task_id) : null;
		try {
			const result = await pool.cancel(taskId || undefined);
			ws.send(
				JSON.stringify({ type: "cancel_result", result, task_id: taskId }),
			);
			console.log(`[worker] Cancel result: ${result}`);
		} catch (err) {
			ws.send(
				JSON.stringify({
					type: "cancel_result",
					result: `Error: ${err}`,
					task_id: taskId,
				}),
			);
			console.log(`[worker] Cancel error: ${err}`);
		}
		return;
	}

	if (type === "retry_task") {
		const pool = getAgentPool();
		const feedback = String(data.feedback || "");
		const taskId = data.task_id ? String(data.task_id) : null;

		const worker = taskId ? pool.getWorkerForTask(taskId) : undefined;
		let lastTask = worker?.getLastTaskDescription() || null;
		if (!lastTask) {
			const poolWorkers = (
				pool as {
					workers?: Array<{ getLastTaskDescription?: () => string | null }>;
				}
			).workers;
			const candidates = Array.isArray(poolWorkers) ? poolWorkers : [];
			for (const candidate of candidates) {
				const desc = candidate.getLastTaskDescription?.() || null;
				if (desc) {
					lastTask = desc;
					break;
				}
			}
		}

		if (lastTask) {
			const newTask = feedback
				? `${lastTask}\n\nAdditional instructions: ${feedback}`
				: lastTask;
			console.log(
				`[worker] Retrying task with feedback: ${feedback ? feedback.slice(0, 50) : "(none)"}...`,
			);
			void (async () => {
				for await (const _event of pool.execute(newTask)) {
					// events forwarded by agent process listener
				}
			})();
			ws.send(JSON.stringify({ type: "retry_started" }));
		} else {
			ws.send(
				JSON.stringify({
					type: "retry_error",
					error: "No previous task to retry",
				}),
			);
		}
		return;
	}

	if (type === "file_upload_start") {
		const fileId = String(data.file_id || "");
		const requestId = String(data.id || "");
		if (fileId && requestId) {
			cleanupStaleUploads();
			if (pendingUploads.size >= MAX_PENDING_UPLOADS) {
				console.log(`[worker] Too many pending uploads, rejecting ${fileId}`);
				return;
			}
			const totalChunks = Number(data.total_chunks || 1);
			pendingUploads.set(fileId, {
				request_id: requestId,
				name: String(data.name || "upload"),
				mime: String(data.mime || "application/octet-stream"),
				size: Number(data.size || 0),
				total_chunks: totalChunks,
				chunks: new Map(),
				started_at: Date.now() / 1000,
			});
			console.log(
				`[worker] File upload started: ${fileId} (${String(data.name || "upload")}, ${totalChunks} chunks)`,
			);
		}
		return;
	}

	if (type === "file_upload_chunk") {
		const fileId = String(data.file_id || "");
		const chunkIndex = Number(data.chunk_index ?? -1);
		const chunkData = String(data.data || "");
		const pending = pendingUploads.get(fileId);
		if (!pending) {
			console.log(`[worker] File chunk for unknown upload: ${fileId}`);
			return;
		}

		if (
			!Number.isInteger(chunkIndex) ||
			chunkIndex < 0 ||
			chunkIndex >= pending.total_chunks
		) {
			console.log(
				`[worker] Invalid chunk index ${chunkIndex} for upload ${fileId} (total: ${pending.total_chunks})`,
			);
			return;
		}

		if (pending.chunks.has(chunkIndex)) {
			console.log(
				`[worker] Duplicate chunk ${chunkIndex} for ${fileId}, ignoring`,
			);
			return;
		}

		if (chunkData.length > MAX_CHUNK_SIZE) {
			console.log(`[worker] Chunk too large: ${chunkData.length} bytes`);
			return;
		}

		pending.chunks.set(chunkIndex, chunkData);
		const received = pending.chunks.size;
		console.log(
			`[worker] File chunk ${chunkIndex + 1}/${pending.total_chunks} for ${fileId}`,
		);

		if (received >= pending.total_chunks) {
			await finalizeUpload(fileId, pending);
		}
		return;
	}

	console.log(`[worker] Unknown message type: ${type}`);
}

async function connectWorker(url: string, token: string): Promise<void> {
	while (true) {
		console.log(`[worker] Connecting to ${url}...`);
		const ws = new WebSocket(url, [`bearer.${token}`]);
		let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

		await new Promise<void>((resolve) => {
			ws.onopen = async () => {
				console.log("[worker] Connected!");
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
				}
				heartbeatInterval = setInterval(() => {
					try {
						ws.send(JSON.stringify({ type: "heartbeat" }));
					} catch (err) {
						console.log(`[worker] Heartbeat send failed: ${err}`);
					}
				}, 25000);

				const pool = getAgentPool();
				setEventCallback((event) => {
					debug(
						`[DEBUG] Forwarding bridge event: ${String(event.type || "unknown")}`,
					);
					ws.send(JSON.stringify({ type: "client_event", payload: event }));
				});
				setTaskIdCallback(() => pool.getCurrentTaskId());

				const removeListener = addAgentEventListener((event) => {
					debug(`[DEBUG] Forwarding event to server: ${JSON.stringify(event)}`);
					ws.send(JSON.stringify({ type: "agent_event", event }));
				});

				try {
					const workspace = await getWorkspaceInfo();
					ws.send(JSON.stringify({ type: "workspace_info", workspace }));
					console.log(
						`[worker] Sent workspace info: ${(workspace.skills as string[] | undefined)?.length || 0} skills`,
					);
				} catch (err) {
					console.log(`[worker] Failed to send workspace info: ${err}`);
				}

				ws.onmessage = async (event) => {
					try {
						let payload: string;
						if (typeof event.data === "string") {
							payload = event.data;
						} else if (event.data instanceof ArrayBuffer) {
							payload = Buffer.from(event.data).toString("utf8");
						} else {
							payload = Buffer.from(event.data).toString("utf8");
						}
						const data = JSON.parse(payload) as Record<string, unknown>;
						await handleMessage(ws, data);
					} catch (err) {
						console.log(`[worker] Invalid JSON: ${String(err)}`);
					}
				};

				ws.onclose = () => {
					removeListener();
					setEventCallback(null);
					activeCallId = null;
					if (heartbeatInterval) {
						clearInterval(heartbeatInterval);
						heartbeatInterval = null;
					}
					console.log("[worker] Connection closed");
					resolve();
				};

				ws.onerror = (err) => {
					console.log(`[worker] WebSocket error: ${String(err)}`);
				};
			};

			ws.onerror = () => {
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
					heartbeatInterval = null;
				}
				resolve();
			};

			ws.onclose = () => {
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
					heartbeatInterval = null;
				}
				resolve();
			};
		});

		console.log(`[worker] Reconnecting in ${RECONNECT_DELAY_MS}ms...`);
		await sleep(RECONNECT_DELAY_MS);
	}
}

export async function startWorker(args: string[]): Promise<void> {
	if (args[0] === "join") {
		await joinWorker(args.slice(1));
		return;
	}

	applyWorkspaceDir(args);
	const connectArg = getArgValue(args, "--connect");
	const agentArg = getArgValue(args, "--agent");
	const storedCreds = await loadWorkerCredentials();
	const wsUrl = connectArg
		? connectArg
		: storedCreds?.server_url
			? toWsUrl(storedCreds.server_url)
			: getEnv("BIGWIG_SERVER", "ws://localhost:8080/worker");
	const token = storedCreds?.credential || "";
	const agentName = agentArg ? agentArg : getEnv("BIGWIG_AGENT", "amp");

	if (agentName) {
		process.env.BIGWIG_AGENT = agentName;
	}

	if (!token) {
		console.log(
			"[worker] Error: worker credential required (run `myworker join` first)",
		);
		return;
	}

	const url = wsUrl;

	console.log("[worker] Starting Bigwig Worker...");
	console.log(`[worker] Server: ${url}`);
	console.log(`[worker] Token: ${token.slice(0, 8)}...`);
	console.log(`[worker] Workspace: ${WORKSPACE_DIR}`);
	console.log(`[worker] Agent: ${agentName}`);

	await initWorkspace(agentName);
	await startBridge();
	const connectPromise = connectWorker(url, token);
	await initAgentWorkspace();

	const pool = getAgentPool();
	void (async () => {
		while (true) {
			await sleep(30000);
			try {
				const stopped = await pool.cleanupIdleWorkers();
				if (stopped > 0) {
					console.log(`[worker] Cleaned up ${stopped} idle process(es)`);
				}
			} catch (err) {
				console.log(`[worker] Cleanup error: ${err}`);
			}
		}
	})();

	await connectPromise;
}
