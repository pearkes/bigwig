import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed25519.etc.sha512Sync = sha512;
ed25519.etc.sha512Async = async (msg) => sha512(msg);

function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (typeof address === "string" || !address) {
				server.close();
				return reject(new Error("Failed to allocate port"));
			}
			const port = address.port;
			server.close(() => resolve(port));
		});
	});
}

async function waitForHttp(url: string, timeoutMs = 10000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.status === 200) return;
		} catch {
			// ignore
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error("Server did not respond in time");
}

async function waitForEvent<T>(
	ws: WebSocket,
	predicate: (data: T) => boolean,
	timeoutMs = 5000,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Timed out waiting for event")),
			timeoutMs,
		);
		const handler = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data as string) as T;
				if (predicate(data)) {
					clearTimeout(timeout);
					ws.removeEventListener("message", handler);
					resolve(data);
				}
			} catch {
				// ignore
			}
		};
		ws.addEventListener("message", handler);
	});
}

const repoRoot = join(import.meta.dir, "..", "..", "..");
const runIntegration = process.env.BIGWIG_RUN_INTEGRATION === "1";
const allowNetworkTests = process.env.BIGWIG_TEST_NETWORK === "1";

async function canListenOnLocalhost(): Promise<boolean> {
	if (!runIntegration || !allowNetworkTests) return false;
	return new Promise((resolve) => {
		const server = net.createServer();
		server.unref();
		server.once("error", () => resolve(false));
		server.listen(0, "127.0.0.1", () => {
			server.close(() => resolve(true));
		});
	});
}

const canRunNetworkTests = runIntegration && (await canListenOnLocalhost());
const describeWithNetwork = canRunNetworkTests ? describe : describe.skip;

type ConnectedEvent = { type: "connected" };
type WorkerStatusEvent = { type: "worker_status"; connected: boolean };

let serverProc: ReturnType<typeof Bun.spawn> | null = null;
let workerProc: ReturnType<typeof Bun.spawn> | null = null;
let workspaceDir: string | null = null;
let workerHome: string | null = null;
let port = 0;
let bridgePort = 0;
let sessionToken = "";

const bytesToBase64Url = (bytes: Uint8Array): string =>
	Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

const randomBase64Url = (): string => {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return bytesToBase64Url(bytes);
};

const signMessage = async (
	message: string,
	privateKey: Uint8Array,
): Promise<string> => {
	const signature = await ed25519.sign(
		new TextEncoder().encode(message),
		privateKey,
	);
	return bytesToBase64Url(signature);
};

type PairingInfo = {
	pairing_code: string;
	pairing_nonce: string;
	server_fingerprint: string;
	expires_at?: number;
};

async function waitForPairing(
	path: string,
	timeoutMs = 5000,
): Promise<PairingInfo> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const raw = await readFile(path, "utf8");
			const parsed = JSON.parse(raw) as { pairing?: PairingInfo };
			if (parsed?.pairing?.pairing_code) {
				return parsed.pairing;
			}
		} catch {
			// ignore
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error("Pairing info not available");
}

async function requestDeviceSession(
	baseUrl: string,
	deviceId: string,
	privateKey: Uint8Array,
) {
	const timestamp = Date.now();
	const nonce = randomBase64Url();
	const message = `POST\n/device/session\n${timestamp}\n${nonce}`;
	const signature = await signMessage(message, privateKey);
	const res = await fetch(`${baseUrl}/device/session`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			device_id: deviceId,
			timestamp,
			nonce,
			signature,
		}),
	});
	const body = await res.json();
	if (!res.ok) throw new Error(body.error || "Device session failed");
	return body.token as string;
}

async function requestWorkerJoinToken(
	baseUrl: string,
	deviceId: string,
	privateKey: Uint8Array,
) {
	const timestamp = Date.now();
	const nonce = randomBase64Url();
	const message = `POST\n/device/worker-join-token\n${timestamp}\n${nonce}`;
	const signature = await signMessage(message, privateKey);
	const res = await fetch(`${baseUrl}/device/worker-join-token`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			device_id: deviceId,
			timestamp,
			nonce,
			signature,
		}),
	});
	const body = await res.json();
	if (!res.ok) throw new Error(body.error || "Worker join token failed");
	return body.token as string;
}

describeWithNetwork("Bun runtime integration", () => {
	beforeAll(async () => {
		port = await findFreePort();
		bridgePort = await findFreePort();
		workspaceDir = await mkdtemp(join(tmpdir(), "bigwig-workspace-"));
		workerHome = await mkdtemp(join(tmpdir(), "bigwig-home-"));
		const credentialsPath = join(
			tmpdir(),
			`bigwig-credentials-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
		);

		serverProc = Bun.spawn({
			cmd: [process.execPath, "run", "src/index.ts", "server"],
			cwd: repoRoot,
			env: {
				...process.env,
				PORT: String(port),
				DEBUG: "true",
				ORIGIN: `http://127.0.0.1:${port}`,
				BIGWIG_CREDENTIALS_PATH: credentialsPath,
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const baseUrl = `http://127.0.0.1:${port}`;
		await waitForHttp(`${baseUrl}/pairing/status`);

		const pairing = await waitForPairing(credentialsPath);
		const claimRes = await fetch(`${baseUrl}/pairing/claim`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ pairing_code: pairing.pairing_code }),
		});
		const claimBody = await claimRes.json();
		if (!claimRes.ok)
			throw new Error(claimBody.error || "Pairing claim failed");

		const devicePrivateKey = crypto.getRandomValues(new Uint8Array(32));
		const devicePublicKey = await ed25519.getPublicKey(devicePrivateKey);
		const pairingMessage = `pairing:${claimBody.pairing_nonce}:${claimBody.server_fingerprint}`;
		const pairingSignature = await signMessage(
			pairingMessage,
			devicePrivateKey,
		);

		const confirmRes = await fetch(`${baseUrl}/pairing/confirm`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				pairing_nonce: claimBody.pairing_nonce,
				device_public_key: bytesToBase64Url(devicePublicKey),
				signature: pairingSignature,
			}),
		});
		const confirmBody = await confirmRes.json();
		if (!confirmRes.ok)
			throw new Error(confirmBody.error || "Pairing confirm failed");

		sessionToken = await requestDeviceSession(
			baseUrl,
			confirmBody.device_id,
			devicePrivateKey,
		);

		const joinToken = await requestWorkerJoinToken(
			baseUrl,
			confirmBody.device_id,
			devicePrivateKey,
		);
		const workerPrivateKey = crypto.getRandomValues(new Uint8Array(32));
		const workerPublicKey = await ed25519.getPublicKey(workerPrivateKey);
		const joinRes = await fetch(`${baseUrl}/worker/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				join_token: joinToken,
				worker_public_key: bytesToBase64Url(workerPublicKey),
			}),
		});
		const joinBody = await joinRes.json();
		if (!joinRes.ok) throw new Error(joinBody.error || "Worker join failed");

		const workerCredsDir = join(workerHome, ".bigwig");
		await mkdir(workerCredsDir, { recursive: true });
		await writeFile(
			join(workerCredsDir, "worker.json"),
			JSON.stringify(
				{
					server_url: baseUrl,
					worker_id: joinBody.worker_id,
					credential: joinBody.credential,
					public_key: bytesToBase64Url(workerPublicKey),
					private_key: bytesToBase64Url(workerPrivateKey),
				},
				null,
				2,
			),
			"utf8",
		);

		workerProc = Bun.spawn({
			cmd: [process.execPath, "run", "src/index.ts", "worker"],
			cwd: repoRoot,
			env: {
				...process.env,
				HOME: workerHome,
				BIGWIG_SKIP_SYNC: "1",
				BIGWIG_BRIDGE_PORT: String(bridgePort),
				WORKSPACE_DIR: workspaceDir,
			},
			stdout: "pipe",
			stderr: "pipe",
		});
	});

	afterAll(async () => {
		if (workerProc) {
			workerProc.kill();
			await workerProc.exited;
		}
		if (serverProc) {
			serverProc.kill();
			await serverProc.exited;
		}
		if (workspaceDir) {
			await rm(workspaceDir, { recursive: true, force: true });
		}
		if (workerHome) {
			await rm(workerHome, { recursive: true, force: true });
		}
	});

	test("server and worker connect", async () => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}/events`, [
			`bearer.${sessionToken}`,
		]);

		await new Promise<void>((resolve, reject) => {
			ws.addEventListener("open", () => resolve());
			ws.addEventListener("error", () => reject(new Error("WebSocket failed")));
		});

		await waitForEvent<ConnectedEvent>(ws, (data) => data.type === "connected");
		const status = await waitForEvent<WorkerStatusEvent>(
			ws,
			(data) => data.type === "worker_status",
		);
		expect(status.connected).toBe(true);

		ws.send(
			JSON.stringify({
				type: "file_upload_start",
				id: "req_1",
				file_id: "file_1",
				name: "note.txt",
				mime: "text/plain",
				size: 4,
				total_chunks: 1,
			}),
		);
		ws.send(
			JSON.stringify({
				type: "file_upload_chunk",
				id: "req_1",
				file_id: "file_1",
				chunk_index: 0,
				data: "ZGF0YQ==",
			}),
		);

		const res = await fetch(`http://127.0.0.1:${port}/workers`, {
			headers: { Authorization: `Bearer ${sessionToken}` },
		});
		expect(res.status).toBe(200);
		const payload = await res.json();
		expect(payload.connected).toBe(true);

		ws.close();
	}, 20000);
});
