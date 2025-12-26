import { describe, expect, test } from "bun:test";
import {
	CLIENT_TO_WEB_TYPES,
	validateClientConnected,
	validateRequiredFields,
} from "../../../src/shared/protocol";

describe("Web ↔ Client protocol", () => {
	test("connected message valid", () => {
		const msg = {
			type: "connected",
			client_id: "client-abc123",
			session_id: "session-def456",
			worker_connected: true,
			worker_id: "worker-789",
		};
		const validation = validateClientConnected(msg);
		expect(validation.ok).toBe(true);
	});

	test("connected message missing client_id", () => {
		const msg = { type: "connected", session_id: "session-def456" };
		const validation = validateClientConnected(msg);
		expect(validation.ok).toBe(false);
	});

	test("worker status required fields", () => {
		const msg = {
			type: "worker_status",
			connected: true,
			worker_id: "worker-abc123",
		};
		const validation = validateRequiredFields(msg, ["type", "connected"]);
		expect(validation.ok).toBe(true);
	});

	test("client to web types", () => {
		const expected = [
			"input_response",
			"file_upload_start",
			"file_upload_chunk",
			"heartbeat",
			"call_heartbeat",
		].sort();
		expect(Array.from(CLIENT_TO_WEB_TYPES).sort()).toEqual(expected);
	});

	test("event serializes to JSON", () => {
		const msg = {
			type: "connected",
			client_id: "c1",
			session_id: "s1",
			worker_connected: false,
		};
		expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
	});
});
