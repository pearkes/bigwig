import { networkInterfaces } from "node:os";
import { resolve, sep } from "node:path";
import { sha512 } from "@noble/hashes/sha512";
import type { ServerWebSocket } from "bun";
import { getEnv, loadEnv } from "../shared/env";
import { webStaticDir } from "../shared/paths";
import { buildInstructions } from "../shared/prompts";
import {
	CLIENT_TO_WEB_TYPES,
	validateClientConnected,
	validateFileUploadChunk,
	validateFileUploadStart,
	validateMessageType,
	validateWorkerConnected,
	WORKER_TO_WEB_TYPES,
} from "../shared/protocol";
import { debug, randomHex, safeJsonParse } from "../shared/utils";
import {
	ensurePairing,
	loadServerState,
	nextSessionToken,
	nextWorkerCredential,
	pruneExpiredJoinTokens,
	pruneExpiredSessions,
	type ServerState,
	saveServerState,
	type WorkerRecord,
} from "./state";

loadEnv();

export const SERVER_HELP = [
	"Usage: bigwig server [command]",
	"",
	"Commands:",
	"  unpair             Drop paired credentials and reset workers",
	"  --host <host>      Bind host (e.g. 0.0.0.0 for LAN access)",
	"  --origin <url>     Override pairing/QR origin URL",
	"",
	"Notes:",
	"  Requires OPENAI_API_KEY for OpenAI Realtime/WebRTC voice sessions",
	"",
].join("\n");

export function printServerUsage(): void {
	console.log(SERVER_HELP);
}

function parseServerArgs(args: string[]): { host?: string; origin?: string } {
	let host: string | undefined;
	let origin: string | undefined;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--host") {
			host = args[i + 1];
			i += 1;
			continue;
		}
		if (arg.startsWith("--host=")) {
			host = arg.slice("--host=".length);
			continue;
		}
		if (arg === "--origin") {
			origin = args[i + 1];
			i += 1;
			continue;
		}
		if (arg.startsWith("--origin=")) {
			origin = arg.slice("--origin=".length);
		}
	}
	return { host, origin };
}

export function unpairServer(): void {
	const hadPairing = Boolean(serverState.paired_device);
	serverState.paired_device = null;
	serverState.pairing = null;
	serverState.sessions = {};
	serverState.join_tokens = {};
	serverState.workers = {};
	persistState();

	if (hadPairing) {
		console.log(
			"[server] Unpaired: cleared device credential and worker records.",
		);
		return;
	}
	console.log(
		"[server] No paired device found. Cleared worker records anyway.",
	);
}

type ClientSession = {
	ws: ServerWebSocket<SocketData> | null;
	buffer: Record<string, unknown>[];
	lastSeen: number;
	cleanupTimer: ReturnType<typeof setTimeout> | null;
};

type SocketData = {
	type: "worker" | "events";
	sessionId?: string;
	clientId?: string;
	lastEventId?: string;
	workerId?: string;
};

const appPort = Number(getEnv("PORT", "8080"));
const debugEnabled = getEnv("DEBUG", "").toLowerCase() === "true";
let bindHostOverride = "";
let bindOriginOverride = "";

const VALID_VOICES = [
	"alloy",
	"ash",
	"ballad",
	"coral",
	"echo",
	"marin",
	"sage",
	"shimmer",
	"verse",
];

const serverState: ServerState = loadServerState();

const connectedWorker: {
	ws: ServerWebSocket<SocketData> | null;
	id: string | null;
} = {
	ws: null,
	id: null,
};

let workerWorkspace: Record<string, unknown> = {};
const connectedClients = new Map<string, ServerWebSocket<SocketData>>();
const clientToSession = new Map<string, string>();

const clientSessions = new Map<string, ClientSession>();
const clientSessionTtl = Number(getEnv("CLIENT_SESSION_TTL", "300"));
const maxEventBuffer = Number(getEnv("MAX_EVENT_BUFFER", "1000"));
const sessionTtlMs = Number(getEnv("SESSION_TTL", "600")) * 1000;
const pairingTtlMs = Number(getEnv("PAIRING_TTL", "600")) * 1000;
const joinTokenTtlMs = Number(getEnv("WORKER_JOIN_TTL", "300")) * 1000;
const callHeartbeatTtlMs = Number(getEnv("CALL_HEARTBEAT_TTL", "90")) * 1000;
const deviceNonceCache = new Map<string, number>();

type ActiveCallRecord = {
	call_id: string;
	ephemeral_key: string;
	last_seen: number;
	last_dispatched_at: number;
};

let activeCall: ActiveCallRecord | null = null;

function pickLanAddress(): string | null {
	const nets = networkInterfaces();
	for (const iface of Object.values(nets)) {
		if (!iface) continue;
		for (const info of iface) {
			if (info.family === "IPv4" && !info.internal) {
				return info.address;
			}
		}
	}
	return null;
}

function defaultOrigin(): string {
	const explicit = getEnv("ORIGIN", "").trim();
	if (explicit) return explicit.replace(/\/$/, "");

	if (bindOriginOverride) return bindOriginOverride.replace(/\/$/, "");

	const host = (bindHostOverride || getEnv("HOST", "")).trim();
	if (host === "0.0.0.0" || host === "::") {
		const lanIp = pickLanAddress();
		if (lanIp) return `http://${lanIp}:${appPort}`;
	}
	if (host && host !== "127.0.0.1" && host !== "localhost") {
		return `http://${host}:${appPort}`;
	}
	return `http://localhost:${appPort}`;
}

function pruneActiveCall(now = Date.now()): void {
	if (!activeCall) return;
	if (now - activeCall.last_seen > callHeartbeatTtlMs) {
		activeCall = null;
	}
}

function maybeDispatchActiveCall(reason: string): boolean {
	pruneActiveCall();
	if (!activeCall) return false;
	if (!connectedWorker.ws) return false;
	const now = Date.now();
	if (now - activeCall.last_dispatched_at < 10000) return false;
	const dispatched = sendToWorker({
		type: "connect_call",
		call_id: activeCall.call_id,
		ephemeral_key: activeCall.ephemeral_key,
	});
	if (dispatched) {
		activeCall.last_dispatched_at = now;
		debug(
			`[call] Dispatched active call ${activeCall.call_id.slice(0, 8)} via ${reason}`,
		);
	}
	return dispatched;
}

function base64UrlToBytes(input: string): Uint8Array {
	const padded =
		input.replace(/-/g, "+").replace(/_/g, "/") +
		"===".slice((input.length + 3) % 4);
	return Uint8Array.from(Buffer.from(padded, "base64"));
}

function extractBearerToken(request: Request): string | null {
	const authHeader = request.headers.get("authorization") || "";
	if (authHeader.toLowerCase().startsWith("bearer ")) {
		return authHeader.slice(7).trim();
	}

	const protocolHeader = request.headers.get("sec-websocket-protocol") || "";
	if (protocolHeader) {
		const parts = protocolHeader.split(",").map((part) => part.trim());
		for (const part of parts) {
			if (part.startsWith("bearer.")) {
				return part.slice("bearer.".length);
			}
			if (part.startsWith("bearer:")) {
				return part.slice("bearer:".length);
			}
		}
	}

	return null;
}

async function getEd25519() {
	const ed25519 = await import("@noble/ed25519");
	ed25519.etc.sha512Sync = sha512;
	ed25519.etc.sha512Async = async (msg) => sha512(msg);
	return ed25519;
}

function persistState(): void {
	saveServerState(serverState);
}

function isPaired(): boolean {
	return Boolean(serverState.paired_device);
}

function requireAuth(request: Request): { device_id: string } | null {
	const token = extractBearerToken(request);
	if (!token) return null;
	const pruned = pruneExpiredSessions(serverState);
	if (pruned) {
		persistState();
	}
	const session = serverState.sessions[token];
	if (!session) return null;
	if (session.expires_at <= Date.now()) {
		delete serverState.sessions[token];
		persistState();
		return null;
	}
	return { device_id: session.device_id };
}

function findWorkerByCredential(token: string): WorkerRecord | null {
	for (const worker of Object.values(serverState.workers)) {
		if (worker.credential === token) {
			return worker;
		}
	}
	return null;
}

function corsHeaders(): Headers {
	const headers = new Headers();
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	return headers;
}

function jsonResponse(body: unknown, status = 200): Response {
	const headers = corsHeaders();
	headers.set("Content-Type", "application/json");
	return new Response(JSON.stringify(body), { status, headers });
}

function notFound(): Response {
	return new Response("Not Found", { status: 404 });
}

async function generateQrSvg(payload: string): Promise<string | null> {
	try {
		const { default: qr } = await import("qrcode");
		return await qr.toString(payload, { type: "svg", margin: 1 });
	} catch {
		return null;
	}
}

function pruneDeviceNonces(now = Date.now()): void {
	for (const [nonce, expiresAt] of deviceNonceCache.entries()) {
		if (expiresAt <= now) {
			deviceNonceCache.delete(nonce);
		}
	}
}

async function verifyDeviceSignature(params: {
	device_id: string;
	timestamp: number;
	nonce: string;
	signature: string;
	method: string;
	path: string;
}): Promise<boolean> {
	if (!serverState.paired_device) return false;
	if (params.device_id !== serverState.paired_device.device_id) return false;
	const now = Date.now();
	const skewMs = Math.abs(now - params.timestamp);
	if (skewMs > 5 * 60 * 1000) return false;

	pruneDeviceNonces(now);
	if (deviceNonceCache.has(params.nonce)) return false;
	deviceNonceCache.set(params.nonce, now + 10 * 60 * 1000);

	const message = `${params.method}\n${params.path}\n${params.timestamp}\n${params.nonce}`;
	const signatureBytes = base64UrlToBytes(params.signature);
	const publicKeyBytes = base64UrlToBytes(serverState.paired_device.public_key);
	try {
		const { verify } = await getEd25519();
		return await verify(
			signatureBytes,
			new TextEncoder().encode(message),
			publicKeyBytes,
		);
	} catch {
		return false;
	}
}

function handleWorkerMessage(
	workerId: string,
	data: Record<string, unknown>,
): void {
	const msgType = String(data.type || "");
	debug(`[DEBUG] Worker message: type=${msgType}`);
	if (debugEnabled && !validateMessageType(data, WORKER_TO_WEB_TYPES)) {
		debug(`[protocol] Unknown worker message type: ${msgType}`);
	}

	if (msgType === "workspace_info") {
		const ws = (data.workspace as Record<string, unknown>) || {};
		workerWorkspace = {
			info: ws.info || {},
			skills: Array.isArray(ws.skills) ? ws.skills : [],
			recent_tasks: Array.isArray(ws.recent_tasks) ? ws.recent_tasks : [],
		};
		debug(
			`[worker] Received workspace info: ${(workerWorkspace.skills as unknown[] | undefined)?.length || 0} skills`,
		);
		return;
	}

	if (msgType === "task_result") {
		debug(
			`[worker] Task result from ${workerId}: ${String(data.result || "").slice(0, 100)}`,
		);
		return;
	}

	if (msgType === "agent_event") {
		const event = (data.event as Record<string, unknown>) || {};
		debug(`[DEBUG] agent_event received: ${String(event.type || "unknown")}`);
		broadcastToClients(event);
		return;
	}

	if (msgType === "client_event") {
		const payload = (data.payload as Record<string, unknown>) || {};
		if (payload && typeof payload.type === "string") {
			let logPayload = payload.type;
			if (payload.data) {
				logPayload += ` (data: ${String(payload.data).length} chars)`;
			}
			debug(`[DEBUG] client_event received: ${logPayload}`);
			broadcastToClients(payload);
		} else {
			debug("[worker] Invalid client_event: missing type or not a dict");
		}
		return;
	}

	if (msgType === "heartbeat") {
		return;
	}

	if (msgType === "request_active_call") {
		maybeDispatchActiveCall("worker_request");
		return;
	}

	debug(`[worker] Unknown message type: ${msgType}`);
}

function sendToWorker(message: Record<string, unknown>): boolean {
	if (!connectedWorker.ws) return false;
	try {
		connectedWorker.ws.send(JSON.stringify(message));
		return true;
	} catch (err) {
		debug(`[worker] Failed to send: ${err}`);
		return false;
	}
}

function handleClientMessage(
	clientId: string,
	data: Record<string, unknown>,
): void {
	const msgType = String(data.type || "");
	debug(`[DEBUG] Client message from ${clientId}: type=${msgType}`);
	if (debugEnabled && !validateMessageType(data, CLIENT_TO_WEB_TYPES)) {
		debug(`[protocol] Unknown client message type: ${msgType}`);
	}

	if (msgType === "input_response") {
		sendToWorker({
			type: "input_response",
			id: data.id,
			value: data.value,
			cancelled: data.cancelled || false,
		});
		return;
	}

	if (msgType === "file_upload_start") {
		if (debugEnabled) {
			const validation = validateFileUploadStart(data);
			if (!validation.ok) {
				debug(
					`[protocol] file_upload_start missing: ${validation.missing.join(", ")}`,
				);
			}
		}
		sendToWorker({
			type: "file_upload_start",
			id: data.id,
			file_id: data.file_id,
			name: data.name,
			mime: data.mime,
			size: data.size,
			total_chunks: data.total_chunks,
		});
		return;
	}

	if (msgType === "file_upload_chunk") {
		if (debugEnabled) {
			const validation = validateFileUploadChunk(data);
			if (!validation.ok) {
				debug(
					`[protocol] file_upload_chunk missing: ${validation.missing.join(", ")}`,
				);
			}
		}
		sendToWorker({
			type: "file_upload_chunk",
			id: data.id,
			file_id: data.file_id,
			chunk_index: data.chunk_index,
			data: data.data,
		});
		return;
	}

	if (msgType === "heartbeat") {
		return;
	}

	if (msgType === "call_heartbeat") {
		const callId = String(data.call_id || "");
		const ephemeralKey = String(data.ephemeral_key || "");
		const active = data.active !== false;
		if (!callId) {
			debug("[call] call_heartbeat missing call_id");
			return;
		}

		if (!active) {
			if (activeCall && activeCall.call_id === callId) {
				activeCall = null;
				debug(`[call] Cleared active call ${callId.slice(0, 8)}`);
			}
			return;
		}

		if (!ephemeralKey) {
			debug(
				`[call] call_heartbeat missing ephemeral_key for ${callId.slice(0, 8)}`,
			);
			return;
		}

		const now = Date.now();
		const callChanged =
			!activeCall ||
			activeCall.call_id !== callId ||
			activeCall.ephemeral_key !== ephemeralKey;
		activeCall = {
			call_id: callId,
			ephemeral_key: ephemeralKey,
			last_seen: now,
			last_dispatched_at: callChanged ? 0 : activeCall.last_dispatched_at,
		};
		maybeDispatchActiveCall("call_heartbeat");
		return;
	}

	debug(`[client] Unknown message type from client: ${msgType}`);
}

function broadcastToClients(message: Record<string, unknown>): void {
	const clientCount = connectedClients.size;
	let logInfo = String(message.type || "unknown");
	if (message.data) {
		logInfo += ` (data: ${String(message.data).length} chars)`;
	}
	if (message.name) {
		logInfo += ` name=${String(message.name)}`;
	}
	debug(`[DEBUG] Broadcasting to ${clientCount} clients: ${logInfo}`);

	if (clientCount === 0) {
		debug("[DEBUG] WARNING: No clients connected, buffering to sessions");
	}

	for (const [sessionId, session] of clientSessions.entries()) {
		session.buffer.push(message);
		if (session.buffer.length > maxEventBuffer) {
			session.buffer = session.buffer.slice(-maxEventBuffer);
			debug(
				`[session] Buffered event for ${sessionId.slice(0, 8)}, buffer size: ${session.buffer.length}`,
			);
		}
	}

	for (const [clientId, ws] of connectedClients.entries()) {
		try {
			ws.send(JSON.stringify(message));
		} catch (err) {
			debug(`[client] Failed to send to ${clientId}: ${err}`);
			connectedClients.delete(clientId);
			const sessionId = clientToSession.get(clientId);
			if (sessionId && clientSessions.has(sessionId)) {
				const sess = clientSessions.get(sessionId)!;
				sess.buffer.push(message);
				if (sess.buffer.length > maxEventBuffer) {
					sess.buffer = sess.buffer.slice(-maxEventBuffer);
				}
				debug(
					`[session] Buffered failed send for ${sessionId.slice(0, 8)}, buffer size: ${sess.buffer.length}`,
				);
			}
		}
	}
}

function cleanupSession(sessionId: string): void {
	if (clientSessions.delete(sessionId)) {
		debug(`[session] Expired: ${sessionId.slice(0, 8)}`);
	}
}

async function handleSession(request: Request): Promise<Response> {
	const auth = requireAuth(request);
	if (!auth) return jsonResponse({ error: "Not authenticated" }, 401);

	const apiKey = getEnv("OPENAI_API_KEY");
	if (!apiKey)
		return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);

	const data = safeJsonParse(await request.text()) || {};
	const voice = data.voice || "echo";

	if (!VALID_VOICES.includes(voice)) {
		return jsonResponse(
			{ error: `Invalid voice. Must be one of: ${VALID_VOICES.join(", ")}` },
			400,
		);
	}

	const instructions = buildInstructions({
		skills:
			(workerWorkspace.skills as string[] | undefined)
				?.map((skill) => `- ${skill}`)
				.join("\n") || "- None",
		recentTasks:
			(
				workerWorkspace.recent_tasks as
					| Array<{ message: string; relative_time: string }>
					| undefined
			)
				?.map((task) => `- ${task.message} (${task.relative_time})`)
				.join("\n") || "- None",
		userInfo: formatUserInfo(workerWorkspace.info as Record<string, unknown>),
		assistantInfo: formatAssistantInfo(
			workerWorkspace.info as Record<string, unknown>,
		),
	});

	console.log(`[session] Instructions length: ${instructions.length}`);

	const response = await fetch(
		"https://api.openai.com/v1/realtime/client_secrets",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				session: {
					type: "realtime",
					model: "gpt-realtime",
					instructions,
					audio: {
						output: { voice },
						input: { transcription: { model: "gpt-4o-transcribe" } },
					},
					include: ["item.input_audio_transcription.logprobs"],
					tools: [
						{
							type: "function",
							name: "read_content",
							description:
								"Read content cards on the user's screen, optionally scoped to a specific task. Returns plain-text content in display order (most recent last).",
							parameters: {
								type: "object",
								properties: {
									task_id: {
										type: "string",
										description:
											"Optional task id to read content for. If omitted, returns content for the most recent task with content.",
									},
								},
								required: [],
							},
						},
					],
					tool_choice: "auto",
				},
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		console.log(`OpenAI API error: ${response.status} ${errorText}`);
		return jsonResponse({ error: `OpenAI API error: ${response.status}` }, 500);
	}

	const payload = await response.json();
	console.log("Ephemeral key created");
	return jsonResponse({ value: payload.value });
}

function formatUserInfo(info: Record<string, unknown>): string {
	const markdown = typeof info?.user_markdown === "string" ? info.user_markdown : "";
	if (markdown.trim().length > 0) return markdown;
	const user = info?.user || {};
	if (!user || Object.keys(user).length === 0) return "- Not configured";
	return `- Name: ${user.name || "Unknown"}\n- Email: ${user.email || "Unknown"}\n- Location: ${user.location || "Unknown"}`;
}

function formatAssistantInfo(info: Record<string, unknown>): string {
	const assistant = info?.assistant || {};
	if (!assistant || Object.keys(assistant).length === 0)
		return "- Not configured";
	return `- Email: ${assistant.email || "Unknown"}`;
}

async function handleStatic(request: Request): Promise<Response> {
	const staticDir = webStaticDir();
	const pathname = new URL(request.url).pathname;
	const staticRoot = resolve(staticDir);
	const relativePath =
		pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
	const filePath = resolve(staticRoot, relativePath);
	if (filePath !== staticRoot && !filePath.startsWith(staticRoot + sep)) {
		return notFound();
	}
	try {
		const file = Bun.file(filePath);
		if (!(await file.exists())) {
			return notFound();
		}
		return new Response(file);
	} catch {
		return notFound();
	}
}

function handlePairingStatus(): Response {
	return jsonResponse({
		paired: isPaired(),
		server_fingerprint: serverState.server_identity?.fingerprint || null,
	});
}

async function handlePairingClaim(request: Request): Promise<Response> {
	const body = safeJsonParse(await request.text()) || {};
	const pairingCode = String(body.pairing_code || "")
		.trim()
		.toUpperCase();
	const pairingNonce = String(body.pairing_nonce || "").trim();

	const pairing = ensurePairing(serverState, pairingTtlMs);
	if (!pairing) return jsonResponse({ error: "Server already paired" }, 409);

	if (pairingCode) {
		if (pairingCode !== pairing.pairing_code) {
			return jsonResponse({ error: "Invalid pairing code" }, 400);
		}
	} else if (pairingNonce) {
		if (pairingNonce !== pairing.nonce) {
			return jsonResponse({ error: "Invalid pairing nonce" }, 400);
		}
	} else {
		return jsonResponse(
			{ error: "pairing_code or pairing_nonce required" },
			400,
		);
	}

	persistState();
	return jsonResponse({
		server_fingerprint: serverState.server_identity?.fingerprint || null,
		pairing_nonce: pairing.nonce,
		match_code: pairing.match_code,
		expires_at: pairing.expires_at,
	});
}

async function handlePairingConfirm(request: Request): Promise<Response> {
	if (isPaired()) return jsonResponse({ error: "Server already paired" }, 409);
	const pairing = ensurePairing(serverState, pairingTtlMs);
	if (!pairing) return jsonResponse({ error: "Pairing not available" }, 409);

	const body = safeJsonParse(await request.text()) || {};
	const pairingNonce = String(body.pairing_nonce || "").trim();
	const devicePublicKey = String(body.device_public_key || "").trim();
	const signature = String(body.signature || "").trim();

	if (!pairingNonce || !devicePublicKey || !signature) {
		return jsonResponse(
			{ error: "pairing_nonce, device_public_key, signature required" },
			400,
		);
	}

	if (pairingNonce !== pairing.nonce || pairing.expires_at <= Date.now()) {
		return jsonResponse({ error: "Pairing nonce expired" }, 400);
	}

	const fingerprint = serverState.server_identity?.fingerprint || "";
	const message = `pairing:${pairingNonce}:${fingerprint}`;
	const signatureBytes = base64UrlToBytes(signature);
	const publicKeyBytes = base64UrlToBytes(devicePublicKey);
	const { verify } = await getEd25519();
	const verified = await verify(
		signatureBytes,
		new TextEncoder().encode(message),
		publicKeyBytes,
	);
	if (!verified) {
		return jsonResponse({ error: "Invalid signature" }, 401);
	}

	const deviceId = randomHex(16);
	serverState.paired_device = {
		device_id: deviceId,
		public_key: devicePublicKey,
		paired_at: new Date().toISOString(),
	};
	serverState.pairing = null;
	persistState();

	return jsonResponse({
		success: true,
		device_id: deviceId,
		server_fingerprint: fingerprint,
	});
}

async function handlePairingQr(request: Request): Promise<Response> {
	if (isPaired()) return jsonResponse({ error: "Server already paired" }, 409);
	const pairing = ensurePairing(serverState, pairingTtlMs);
	if (!pairing) return jsonResponse({ error: "Pairing not available" }, 409);

	const url = new URL(request.url);
	const code = url.searchParams.get("code") || "";
	const nonce = url.searchParams.get("nonce") || "";

	if (!code && !nonce) {
		return jsonResponse({ error: "code or nonce required" }, 400);
	}
	if (code && code.toUpperCase() !== pairing.pairing_code) {
		return jsonResponse({ error: "Invalid pairing code" }, 400);
	}
	if (nonce && nonce !== pairing.nonce) {
		return jsonResponse({ error: "Invalid pairing nonce" }, 400);
	}

	const serverUrl = defaultOrigin();
	const fingerprint = serverState.server_identity?.fingerprint || "unknown";
	const payload = JSON.stringify({
		url: serverUrl,
		server_fingerprint: fingerprint,
		pairing_nonce: pairing.nonce,
		expires_at: pairing.expires_at,
	});
	const svg = await generateQrSvg(payload);
	if (!svg) {
		return jsonResponse({ error: "QR generator unavailable" }, 500);
	}

	const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bigwig Pairing QR</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #111; color: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: #1b1b1b; padding: 24px; border-radius: 12px; text-align: center; max-width: 360px; width: 100%; }
      .code { font-size: 20px; letter-spacing: 2px; }
      .meta { font-size: 12px; color: #bbb; margin-top: 8px; }
      svg { width: 100%; height: auto; background: #fff; border-radius: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div>${svg}</div>
      <div class="code">${pairing.pairing_code}</div>
      <div class="meta">Server: ${serverUrl}</div>
      <div class="meta">Server ID: ${fingerprint}</div>
      <div class="meta">Match code: ${pairing.match_code}</div>
    </div>
  </body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

async function handleDeviceSession(request: Request): Promise<Response> {
	if (!serverState.paired_device)
		return jsonResponse({ error: "Server not paired" }, 409);
	const body = safeJsonParse(await request.text()) || {};
	const deviceId = String(body.device_id || "").trim();
	const timestamp = Number(body.timestamp || 0);
	const nonce = String(body.nonce || "").trim();
	const signature = String(body.signature || "").trim();

	if (!deviceId || !timestamp || !nonce || !signature) {
		return jsonResponse(
			{ error: "device_id, timestamp, nonce, signature required" },
			400,
		);
	}

	const ok = await verifyDeviceSignature({
		device_id: deviceId,
		timestamp,
		nonce,
		signature,
		method: request.method,
		path: new URL(request.url).pathname,
	});
	if (!ok) return jsonResponse({ error: "Invalid device signature" }, 401);

	pruneExpiredSessions(serverState);
	const token = nextSessionToken();
	const expiresAt = Date.now() + sessionTtlMs;
	serverState.sessions[token] = { device_id: deviceId, expires_at: expiresAt };
	persistState();

	return jsonResponse({ token, expires_at: expiresAt });
}

async function handleWorkerJoinToken(request: Request): Promise<Response> {
	if (!serverState.paired_device)
		return jsonResponse({ error: "Server not paired" }, 409);
	const body = safeJsonParse(await request.text()) || {};
	const deviceId = String(body.device_id || "").trim();
	const timestamp = Number(body.timestamp || 0);
	const nonce = String(body.nonce || "").trim();
	const signature = String(body.signature || "").trim();

	if (!deviceId || !timestamp || !nonce || !signature) {
		return jsonResponse(
			{ error: "device_id, timestamp, nonce, signature required" },
			400,
		);
	}

	const ok = await verifyDeviceSignature({
		device_id: deviceId,
		timestamp,
		nonce,
		signature,
		method: request.method,
		path: new URL(request.url).pathname,
	});
	if (!ok) return jsonResponse({ error: "Invalid device signature" }, 401);

	pruneExpiredJoinTokens(serverState);
	const joinToken = randomHex(16);
	const expiresAt = Date.now() + joinTokenTtlMs;
	serverState.join_tokens[joinToken] = {
		device_id: deviceId,
		expires_at: expiresAt,
	};
	persistState();

	return jsonResponse({ token: joinToken, expires_at: expiresAt });
}

async function handleWorkerJoin(request: Request): Promise<Response> {
	const body = safeJsonParse(await request.text()) || {};
	const joinToken = String(body.join_token || "").trim();
	const workerPublicKey = String(body.worker_public_key || "").trim();
	if (!joinToken || !workerPublicKey) {
		return jsonResponse(
			{ error: "join_token, worker_public_key required" },
			400,
		);
	}

	pruneExpiredJoinTokens(serverState);
	const record = serverState.join_tokens[joinToken];
	if (!record)
		return jsonResponse({ error: "Invalid or expired join token" }, 401);
	delete serverState.join_tokens[joinToken];

	const workerId = randomHex(8);
	const credential = nextWorkerCredential();
	const now = Date.now();
	serverState.workers[workerId] = {
		worker_id: workerId,
		public_key: workerPublicKey,
		credential,
		created_at: now,
		last_seen: now,
	};
	persistState();

	return jsonResponse({ worker_id: workerId, credential });
}

function handleWorkers(request: Request): Response {
	const auth = requireAuth(request);
	if (!auth) return jsonResponse({ error: "Not authenticated" }, 401);

	return jsonResponse({
		joined: Object.keys(serverState.workers).length > 0,
		connected: connectedWorker.ws !== null,
		worker_id: connectedWorker.id,
		workspace: workerWorkspace,
	});
}

function handleConnect(request: Request): Promise<Response> | Response {
	const auth = requireAuth(request);
	if (!auth) return jsonResponse({ error: "Not authenticated" }, 401);

	return (async () => {
		const data = safeJsonParse(await request.text()) || {};
		if (!data.call_id) return jsonResponse({ error: "call_id required" }, 400);
		if (!data.ephemeral_key)
			return jsonResponse({ error: "ephemeral_key required" }, 400);

		if (!connectedWorker.ws)
			return jsonResponse({ error: "No worker connected" }, 503);

		const success = sendToWorker({
			type: "connect_call",
			call_id: data.call_id,
			ephemeral_key: data.ephemeral_key,
		});

		if (success)
			return jsonResponse({ status: "connected", worker: connectedWorker.id });
		return jsonResponse({ error: "Failed to reach worker" }, 503);
	})();
}

function printPairingInfo(): void {
	if (isPaired()) return;
	const pairing = ensurePairing(serverState, pairingTtlMs);
	if (!pairing) return;
	persistState();

	const serverUrl = defaultOrigin();
	const fingerprint = serverState.server_identity?.fingerprint || "unknown";
	const payload = JSON.stringify({
		url: serverUrl,
		server_fingerprint: fingerprint,
		pairing_nonce: pairing.nonce,
		expires_at: pairing.expires_at,
	});
	const qrUrl = `${serverUrl.replace(/\/$/, "")}/pairing/qr?code=${pairing.pairing_code}`;

	const isTty = Boolean(process.stdout.isTTY);
	if (!isTty) {
		console.log(`[Pairing] QR code: ${qrUrl}`);
		console.log(
			"[Pairing] Pairing code: %s  Match code: %s",
			pairing.pairing_code,
			pairing.match_code,
		);
		return;
	}

	console.log("[Pairing]");
	console.log("Open the Bigwig iOS App and scan this QR Code:\n");
	void import("qrcode-terminal")
		.then((mod) => {
			const qr = (mod as { default?: typeof mod }).default ?? mod;
			qr.generate(payload, { small: true });
			console.log(
				"[Pairing] Pairing code: %s  Match code: %s",
				pairing.pairing_code,
				pairing.match_code,
			);
			console.log(`\nCode not displaying correctly? ${qrUrl}\n`);
		})
		.catch(() => {
			console.log("[Pairing] (QR generator not installed)");
			console.log(
				"[Pairing] Pairing code: %s  Match code: %s",
				pairing.pairing_code,
				pairing.match_code,
			);
			console.log(`\nCode not displaying correctly? ${qrUrl}\n`);
		});
}

export function startServer(args: string[] = []): ReturnType<typeof Bun.serve> {
	const { host, origin } = parseServerArgs(args);
	bindHostOverride = host ?? "";
	bindOriginOverride = origin ?? "";
	const apiKey = getEnv("OPENAI_API_KEY", "").trim();
	if (!apiKey) {
		console.error(
			"\n[server] OPENAI_API_KEY is required to start Bigwig.\n\nThe server manages voice sessions and currently depends on the OpenAI Realtime/WebRTC API, with no other providers possible.\nSet it and try again:\n\n  export OPENAI_API_KEY=...\n",
		);
		process.exit(1);
	}
	const hostname = bindHostOverride || getEnv("HOST", "");
	const server = Bun.serve<SocketData>({
		hostname: hostname || undefined,
		port: appPort,
		fetch: async (request, server) => {
			const url = new URL(request.url);
			const pathname = url.pathname;

			if (request.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: corsHeaders() });
			}

			if (!isPaired()) {
				if (
					pathname === "/pairing/status" ||
					pathname === "/pairing/claim" ||
					pathname === "/pairing/confirm" ||
					pathname === "/pairing/qr"
				) {
					// Allowed during first-boot pairing.
				} else {
					return jsonResponse({ error: "Server not paired" }, 403);
				}
			}

			if (pathname === "/worker") {
				const token = extractBearerToken(request);
				if (!token) return jsonResponse({ error: "Not authenticated" }, 401);
				const worker = findWorkerByCredential(token);
				if (!worker) return jsonResponse({ error: "Invalid token" }, 401);
				if (connectedWorker.ws) {
					return jsonResponse({ error: "Worker already connected" }, 409);
				}
				worker.last_seen = Date.now();
				persistState();
				if (
					server.upgrade(request, {
						data: { type: "worker", workerId: worker.worker_id },
					})
				) {
					return new Response(null, { status: 101 });
				}
				return jsonResponse({ error: "Upgrade failed" }, 500);
			}

			if (pathname === "/events") {
				const sessionIdParam = url.searchParams.get("session_id") || undefined;
				const lastEventId = url.searchParams.get("last_event_id") || undefined;

				const auth = requireAuth(request);
				if (!auth) {
					return jsonResponse({ error: "Not authenticated" }, 401);
				}

				if (
					server.upgrade(request, {
						data: { type: "events", sessionId: sessionIdParam, lastEventId },
					})
				) {
					return new Response(null, { status: 101 });
				}
				return jsonResponse({ error: "Upgrade failed" }, 500);
			}

			if (pathname === "/pairing/status") {
				return handlePairingStatus();
			}

			if (pathname === "/pairing/claim" && request.method === "POST") {
				return handlePairingClaim(request);
			}

			if (pathname === "/pairing/confirm" && request.method === "POST") {
				return handlePairingConfirm(request);
			}

			if (pathname === "/pairing/qr" && request.method === "GET") {
				return handlePairingQr(request);
			}

			if (pathname === "/device/session" && request.method === "POST") {
				return handleDeviceSession(request);
			}

			if (
				pathname === "/device/worker-join-token" &&
				request.method === "POST"
			) {
				return handleWorkerJoinToken(request);
			}

			if (pathname === "/worker/join" && request.method === "POST") {
				return handleWorkerJoin(request);
			}

			if (pathname === "/session" && request.method === "POST") {
				return handleSession(request);
			}

			if (pathname === "/workers") {
				return handleWorkers(request);
			}

			if (pathname === "/connect" && request.method === "POST") {
				return handleConnect(request);
			}

			return handleStatic(request);
		},
		websocket: {
			open(ws) {
				if (ws.data.type === "worker") {
					const workerId = ws.data.workerId || randomHex(8);
					connectedWorker.ws = ws;
					connectedWorker.id = workerId;
					if (debugEnabled) {
						const validation = validateWorkerConnected({
							type: "connected",
							worker_id: workerId,
						});
						if (!validation.ok) {
							debug(
								`[protocol] worker connected missing: ${validation.missing.join(", ")}`,
							);
						}
					}
					debug(`[worker] Connected: ${workerId}`);
					broadcastToClients({
						type: "worker_status",
						connected: true,
						worker_id: workerId,
					});
					ws.send(JSON.stringify({ type: "connected", worker_id: workerId }));
					maybeDispatchActiveCall("worker_connect");
					return;
				}

				if (ws.data.type === "events") {
					const resumeSessionId = ws.data.sessionId;
					const lastEventId = ws.data.lastEventId;
					let sessionId = resumeSessionId;
					let bufferedEvents: Record<string, unknown>[] = [];

					if (sessionId && clientSessions.has(sessionId)) {
						const sess = clientSessions.get(sessionId)!;
						if (sess.cleanupTimer) {
							clearTimeout(sess.cleanupTimer);
							sess.cleanupTimer = null;
						}

						const allBuffered = sess.buffer;
						if (lastEventId) {
							const idx = allBuffered.findIndex(
								(evt) => evt.id === lastEventId,
							);
							bufferedEvents =
								idx >= 0 ? allBuffered.slice(idx + 1) : allBuffered;
							if (idx >= 0) {
								debug(
									`[session] Resuming from event ${lastEventId}, replaying ${bufferedEvents.length} events`,
								);
							} else {
								debug(
									`[session] Event ${lastEventId} not found in buffer, replaying ${bufferedEvents.length}`,
								);
							}
						} else {
							bufferedEvents = allBuffered;
						}

						sess.buffer = [];
						sess.ws = ws;
						sess.lastSeen = Date.now();
					} else {
						sessionId = randomHex(16);
						clientSessions.set(sessionId, {
							ws,
							buffer: [],
							lastSeen: Date.now(),
							cleanupTimer: null,
						});
						debug(`[session] New: ${sessionId.slice(0, 8)}`);
					}

					const clientId = randomHex(8);
					connectedClients.set(clientId, ws);
					clientToSession.set(clientId, sessionId!);
					ws.data.clientId = clientId;

					debug(
						`[client] Connected: ${clientId} (total: ${connectedClients.size})`,
					);

					ws.send(
						JSON.stringify({
							type: "connected",
							client_id: clientId,
							session_id: sessionId,
							worker_connected: connectedWorker.ws !== null,
							worker_id: connectedWorker.id,
						}),
					);
					if (debugEnabled) {
						const validation = validateClientConnected({
							type: "connected",
							client_id: clientId,
							session_id: sessionId,
						});
						if (!validation.ok) {
							debug(
								`[protocol] client connected missing: ${validation.missing.join(", ")}`,
							);
						}
					}

					for (const event of bufferedEvents) {
						try {
							ws.send(JSON.stringify(event));
						} catch (err) {
							debug(`[session] Failed to send buffered event: ${err}`);
							break;
						}
					}

					if (bufferedEvents.length) {
						debug(
							`[session] Delivered ${bufferedEvents.length} buffered events`,
						);
					}
				}
			},
			message(ws, message) {
				try {
					const payload =
						typeof message === "string"
							? message
							: new TextDecoder().decode(message);
					const data = JSON.parse(payload) as Record<string, unknown>;
					if (ws.data.type === "worker" && connectedWorker.id) {
						handleWorkerMessage(connectedWorker.id, data);
					} else if (ws.data.type === "events" && ws.data.clientId) {
						handleClientMessage(ws.data.clientId, data);
					} else if (ws.data.type === "events") {
						const clientId = Array.from(connectedClients.entries()).find(
							([, socket]) => socket === ws,
						)?.[0];
						if (clientId) {
							handleClientMessage(clientId, data);
						}
					}
				} catch (err) {
					debug(`[ws] Invalid JSON message: ${err}`);
				}
			},
			close(ws) {
				if (ws.data.type === "worker") {
					const workerId = connectedWorker.id;
					connectedWorker.ws = null;
					connectedWorker.id = null;
					debug(`[worker] Disconnected: ${workerId}`);
					broadcastToClients({
						type: "worker_status",
						connected: false,
						worker_id: null,
					});
					return;
				}

				if (ws.data.type === "events") {
					const clientId = Array.from(connectedClients.entries()).find(
						([, socket]) => socket === ws,
					)?.[0];
					if (clientId) {
						connectedClients.delete(clientId);
						const sessionId = clientToSession.get(clientId);
						clientToSession.delete(clientId);

						debug(
							`[client] Disconnected: ${clientId} (remaining: ${connectedClients.size})`,
						);

						if (sessionId && clientSessions.has(sessionId)) {
							const sess = clientSessions.get(sessionId)!;
							sess.ws = null;
							sess.lastSeen = Date.now();
							const timer = setTimeout(
								() => cleanupSession(sessionId),
								clientSessionTtl * 1000,
							);
							sess.cleanupTimer = timer;
							debug(
								`[session] Keeping alive for ${clientSessionTtl}s: ${sessionId.slice(0, 8)}`,
							);
						}
					}
				}
			},
		},
	});

	console.log(`[server] Starting on port ${appPort}`);
	printPairingInfo();
	return server;
}

export const __test__ = {
	requireAuth,
	extractBearerToken,
	serverState,
	clientSessions,
	broadcastToClients,
	cleanupSession,
	maxEventBuffer,
};
