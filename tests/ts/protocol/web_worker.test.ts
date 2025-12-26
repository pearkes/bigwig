import { describe, expect, test } from "bun:test";
import {
	validateAgentEvent,
	validateFileUploadChunk,
	validateFileUploadStart,
	validateRequiredFields,
	validateWorkerConnected,
	validateWorkspaceInfo,
	WEB_TO_WORKER_TYPES,
	WORKER_TO_WEB_TYPES,
} from "../../../src/shared/protocol";

describe("Web ↔ Worker protocol", () => {
	test("connected message valid", () => {
		const msg = { type: "connected", worker_id: "abc123def456" };
		const validation = validateWorkerConnected(msg);
		expect(validation.ok).toBe(true);
	});

	test("workspace_info valid", () => {
		const msg = {
			type: "workspace_info",
			workspace: {
				skills: ["skill1", "skill2"],
				info: { user: { name: "Test User" } },
				recent_work: [{ message: "Did something", relative_time: "2h ago" }],
			},
		};
		expect(validateWorkspaceInfo(msg)).toBe(true);
	});

	test("agent_event valid", () => {
		const msg = {
			type: "agent_event",
			event: { type: "tool_use", name: "Read", input: "src/main.py" },
		};
		expect(validateAgentEvent(msg)).toBe(true);
	});

	test("file upload start valid", () => {
		const msg = {
			type: "file_upload_start",
			id: "req-123",
			file_id: "file-456",
			name: "document.pdf",
			total_chunks: 10,
		};
		const validation = validateFileUploadStart(msg);
		expect(validation.ok).toBe(true);
	});

	test("file upload chunk valid", () => {
		const msg = {
			type: "file_upload_chunk",
			id: "req-123",
			file_id: "file-456",
			chunk_index: 0,
			data: "SGVsbG8gV29ybGQ=",
		};
		const validation = validateFileUploadChunk(msg);
		expect(validation.ok).toBe(true);
	});

	test("connect_call required fields", () => {
		const msg = {
			type: "connect_call",
			call_id: "call-12345",
			ephemeral_key: "ek_abc",
		};
		const validation = validateRequiredFields(msg, [
			"type",
			"call_id",
			"ephemeral_key",
		]);
		expect(validation.ok).toBe(true);
	});

	test("type enums", () => {
		expect(Array.from(WORKER_TO_WEB_TYPES).sort()).toEqual(
			[
				"workspace_info",
				"task_result",
				"agent_event",
				"client_event",
				"heartbeat",
				"request_active_call",
			].sort(),
		);
		expect(Array.from(WEB_TO_WORKER_TYPES).sort()).toEqual(
			[
				"connected",
				"connect_call",
				"input_response",
				"cancel_task",
				"retry_task",
				"file_upload_start",
				"file_upload_chunk",
			].sort(),
		);
	});
});
