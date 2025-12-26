import { describe, expect, test } from "bun:test";
import {
	BRIDGE_CONTENT_TYPES,
	BRIDGE_REQUEST_TYPES,
	validateInputRequest,
	validateRequiredFields,
} from "../../../src/shared/protocol";

describe("Bridge protocol", () => {
	test("input_request valid", () => {
		const msg = {
			type: "input_request",
			id: "req-abc123",
			prompt: "What is the API key?",
		};
		const validation = validateInputRequest(msg);
		expect(validation.ok).toBe(true);
	});

	test("form_request valid", () => {
		const msg = {
			type: "form_request",
			id: "form-123",
			fields: [
				{ name: "username", type: "text", label: "Username" },
				{ name: "password", type: "password", label: "Password" },
			],
		};
		const validation = validateInputRequest(msg);
		expect(validation.ok).toBe(true);
		expect(BRIDGE_REQUEST_TYPES.has(msg.type)).toBe(true);
	});

	test("file_request valid", () => {
		const msg = {
			type: "file_request",
			id: "file-123",
			prompt: "Upload a document",
		};
		const validation = validateInputRequest(msg);
		expect(validation.ok).toBe(true);
	});

	test("input_response required fields", () => {
		const msg = {
			type: "input_response",
			id: "req-abc123",
			value: "user answer",
		};
		const validation = validateRequiredFields(msg, ["type", "id"]);
		expect(validation.ok).toBe(true);
	});

	test("content events types", () => {
		const msg = {
			type: "message",
			content: "Task completed",
			task_id: "task-123",
		};
		expect(BRIDGE_CONTENT_TYPES.has(msg.type)).toBe(true);
	});
});
