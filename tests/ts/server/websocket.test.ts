import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";

let server: Server | null = null;
let wsBase = "";
let serverMod: typeof import("../../../src/server/index") | null = null;

beforeAll(async () => {
	process.env.OPENAI_API_KEY = "test-key";
	process.env.BIGWIG_CREDENTIALS_PATH = join(
		tmpdir(),
		`bigwig-credentials-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
	);
	const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const mod = await import(`../../../src/server/index?test=${stamp}`);
	serverMod = mod;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const port = 18000 + Math.floor(Math.random() * 20000);
		process.env.PORT = String(port);
		try {
			server = mod.startServer();
			wsBase = `ws://127.0.0.1:${server.port}`;
			break;
		} catch {
			server = null;
		}
	}
});

afterAll(() => {
	if (server) server.stop(true);
});

describe("websocket upgrade", () => {
	test("worker websocket accepts valid token", async () => {
		if (!server || !serverMod) return;
		const { serverState } = serverMod.__test__;
		serverState.paired_device = {
			device_id: "device-1",
			public_key: "pk",
			paired_at: new Date().toISOString(),
		};
		serverState.workers["worker-1"] = {
			worker_id: "worker-1",
			public_key: "wk",
			credential: "cred-1",
			created_at: Date.now(),
			last_seen: Date.now(),
		};

		const result = await new Promise<"open" | "error">((resolve) => {
			const ws = new WebSocket(`${wsBase}/worker`, ["bearer.cred-1"]);
			let settled = false;

			ws.onopen = () => {
				if (!settled) {
					settled = true;
					ws.close();
					resolve("open");
				}
			};
			ws.onerror = () => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			};
			ws.onclose = () => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			};

			setTimeout(() => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			}, 1000);
		});

		expect(result).toBe("open");
	});

	test("worker websocket rejects invalid token", async () => {
		if (!server) return;

		const result = await new Promise<"open" | "error">((resolve) => {
			const ws = new WebSocket(`${wsBase}/worker`, ["bearer.bad"]);
			let settled = false;

			ws.onopen = () => {
				if (!settled) {
					settled = true;
					ws.close();
					resolve("open");
				}
			};
			ws.onerror = () => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			};
			ws.onclose = () => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			};

			setTimeout(() => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			}, 1000);
		});

		expect(result).toBe("error");
	});

	test("events websocket rejects unauthenticated", async () => {
		if (!server) return;

		const result = await new Promise<"open" | "error">((resolve) => {
			const ws = new WebSocket(`${wsBase}/events`);
			let settled = false;

			ws.onopen = () => {
				if (!settled) {
					settled = true;
					ws.close();
					resolve("open");
				}
			};
			ws.onerror = () => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			};
			ws.onclose = () => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			};

			setTimeout(() => {
				if (!settled) {
					settled = true;
					resolve("error");
				}
			}, 1000);
		});

		expect(result).toBe("error");
	});
});
