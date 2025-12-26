import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import type { Server } from "bun";

ed25519.etc.sha512Sync = sha512;
ed25519.etc.sha512Async = async (msg) => sha512(msg);

let server: Server | null = null;
let baseUrl = "";
let serverMod: typeof import("../../../src/server/index") | null = null;
const encoder = new TextEncoder();

const bytesToBase64Url = (bytes: Uint8Array): string =>
	Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

const signMessage = async (
	message: string,
	privateKey: Uint8Array,
): Promise<string> => {
	const signature = await ed25519.sign(encoder.encode(message), privateKey);
	return bytesToBase64Url(signature);
};

beforeAll(async () => {
	process.env.BIGWIG_CREDENTIALS_PATH = join(
		tmpdir(),
		`bigwig-credentials-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
	);
	const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const mod = await import(`../../../src/server/index?test=${stamp}`);
	serverMod = mod;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const port = 14000 + Math.floor(Math.random() * 20000);
		process.env.PORT = String(port);
		try {
			server = mod.startServer();
			baseUrl = `http://127.0.0.1:${server.port}`;
			break;
		} catch {
			server = null;
		}
	}
});

afterAll(() => {
	if (server) server.stop(true);
});

describe("server routes", () => {
	test("pairing status returns paired flag", async () => {
		if (!server) return;
		const res = await fetch(`${baseUrl}/pairing/status`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.paired).toBe(false);
	});

	test("session blocked when server not paired", async () => {
		if (!server) return;
		const res = await fetch(`${baseUrl}/session`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ voice: "echo" }),
		});
		expect(res.status).toBe(403);
	});

	test("session requires auth when paired", async () => {
		if (!server || !serverMod) return;
		const { serverState } = serverMod.__test__;
		serverState.paired_device = {
			device_id: "device-1",
			public_key: "pk",
			paired_at: new Date().toISOString(),
		};

		const res = await fetch(`${baseUrl}/session`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ voice: "echo" }),
		});
		expect(res.status).toBe(401);
	});

	test("worker endpoint rejects invalid token", async () => {
		if (!server || !serverMod) return;
		const { serverState } = serverMod.__test__;
		serverState.paired_device = {
			device_id: "device-1",
			public_key: "pk",
			paired_at: new Date().toISOString(),
		};
		const res = await fetch(`${baseUrl}/worker`, {
			headers: { Authorization: "Bearer bad" },
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBe("Invalid token");
	});

	test("connect returns 503 when no worker connected", async () => {
		if (!server || !serverMod) return;
		const { serverState } = serverMod.__test__;
		serverState.paired_device = {
			device_id: "device-1",
			public_key: "pk",
			paired_at: new Date().toISOString(),
		};
		const token = "tok-1";
		serverState.sessions[token] = {
			device_id: "device-1",
			expires_at: Date.now() + 60_000,
		};

		const res = await fetch(`${baseUrl}/connect`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ call_id: "call-1", ephemeral_key: "ek-1" }),
		});
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.error).toBe("No worker connected");
	});

	test("workers endpoint reports joined status", async () => {
		if (!server || !serverMod) return;
		const { serverState } = serverMod.__test__;
		serverState.paired_device = {
			device_id: "device-1",
			public_key: "pk",
			paired_at: new Date().toISOString(),
		};
		serverState.sessions["tok-joined"] = {
			device_id: "device-1",
			expires_at: Date.now() + 60_000,
		};
		serverState.workers["worker-1"] = {
			worker_id: "worker-1",
			public_key: "pk",
			credential: "cred",
			created_at: Date.now(),
			last_seen: Date.now(),
		};

		const res = await fetch(`${baseUrl}/workers`, {
			headers: { Authorization: "Bearer tok-joined" },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.joined).toBe(true);
	});

	test("worker join token validates device signature", async () => {
		if (!server || !serverMod) return;
		const { serverState } = serverMod.__test__;
		const devicePrivateKey = crypto.getRandomValues(new Uint8Array(32));
		const devicePublicKey = await ed25519.getPublicKey(devicePrivateKey);
		serverState.paired_device = {
			device_id: "device-1",
			public_key: bytesToBase64Url(devicePublicKey),
			paired_at: new Date().toISOString(),
		};

		const timestamp = Date.now();
		const nonce = "nonce-1";
		const message = `POST\n/device/worker-join-token\n${timestamp}\n${nonce}`;
		const signature = await signMessage(message, devicePrivateKey);

		const res = await fetch(`${baseUrl}/device/worker-join-token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				device_id: "device-1",
				timestamp,
				nonce,
				signature,
			}),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.token).toBeTruthy();
		expect(body.expires_at).toBeGreaterThan(Date.now());
	});

	test("worker join rejects expired token", async () => {
		if (!server || !serverMod) return;
		const { serverState } = serverMod.__test__;
		serverState.join_tokens.expired = {
			device_id: "device-1",
			expires_at: Date.now() - 1000,
		};

		const res = await fetch(`${baseUrl}/worker/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				join_token: "expired",
				worker_public_key: "pk",
			}),
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBe("Invalid or expired join token");
	});

	test("worker join consumes token and stores worker", async () => {
		if (!server || !serverMod) return;
		const { serverState } = serverMod.__test__;
		serverState.join_tokens.valid = {
			device_id: "device-1",
			expires_at: Date.now() + 1000,
		};

		const res = await fetch(`${baseUrl}/worker/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				join_token: "valid",
				worker_public_key: "pk",
			}),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.worker_id).toBeTruthy();
		expect(body.credential).toBeTruthy();
		expect(serverState.join_tokens.valid).toBeUndefined();
		expect(serverState.workers[body.worker_id]).toBeTruthy();
	});
});
