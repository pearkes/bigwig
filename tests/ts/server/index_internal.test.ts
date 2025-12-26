import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

function loadServerModule() {
	process.env.MAX_EVENT_BUFFER = "2";
	process.env.BIGWIG_CREDENTIALS_PATH = join(
		tmpdir(),
		`bigwig-credentials-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
	);
	const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return import(`../../../src/server/index?test=${stamp}`);
}

describe("server index internals", () => {
	test("extractBearerToken reads Authorization and subprotocol", async () => {
		const mod = await loadServerModule();
		const { extractBearerToken } = mod.__test__;
		const authReq = new Request("http://example", {
			headers: { authorization: "Bearer tok-1" },
		});
		const protoReq = new Request("http://example", {
			headers: { "sec-websocket-protocol": "bearer.tok-2, other" },
		});

		expect(extractBearerToken(authReq)).toBe("tok-1");
		expect(extractBearerToken(protoReq)).toBe("tok-2");
	});

	test("requireAuth validates bearer token against sessions", async () => {
		const mod = await loadServerModule();
		const { serverState, requireAuth } = mod.__test__;
		serverState.sessions["tok-1"] = {
			device_id: "device-1",
			expires_at: Date.now() + 60_000,
		};
		const tokenReq = new Request("http://example", {
			headers: { authorization: "Bearer tok-1" },
		});

		expect(requireAuth(tokenReq)?.device_id).toBe("device-1");
	});

	test("broadcastToClients buffers per session and trims", async () => {
		const mod = await loadServerModule();
		const { clientSessions, broadcastToClients, maxEventBuffer } = mod.__test__;

		const sessionId = "sess-buffer";
		clientSessions.set(sessionId, {
			ws: null,
			buffer: [],
			lastSeen: Date.now(),
			cleanupTimer: null,
		});

		broadcastToClients({ type: "event", id: "1" });
		broadcastToClients({ type: "event", id: "2" });
		broadcastToClients({ type: "event", id: "3" });

		const buffer = clientSessions.get(sessionId)?.buffer || [];
		expect(buffer.length).toBe(maxEventBuffer);
		expect(buffer[0]?.id).toBe("2");
		expect(buffer[1]?.id).toBe("3");
	});
});
