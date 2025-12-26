export type ValidationResult = { ok: boolean; missing: string[] };

export const WORKER_TO_WEB_TYPES = new Set([
	"workspace_info",
	"task_result",
	"agent_event",
	"client_event",
	"heartbeat",
	"request_active_call",
]);

export const WEB_TO_WORKER_TYPES = new Set([
	"connected",
	"connect_call",
	"input_response",
	"cancel_task",
	"retry_task",
	"file_upload_start",
	"file_upload_chunk",
]);

export const CLIENT_TO_WEB_TYPES = new Set([
	"input_response",
	"file_upload_start",
	"file_upload_chunk",
	"heartbeat",
	"call_heartbeat",
]);

export const BRIDGE_REQUEST_TYPES = new Set([
	"input_request",
	"form_request",
	"file_request",
]);

export const BRIDGE_CONTENT_TYPES = new Set([
	"message",
	"file",
	"file_start",
	"file_chunk",
	"link",
	"code",
	"list",
	"progress",
	"error",
]);

export function validateRequiredFields(
	msg: Record<string, unknown>,
	required: string[],
): ValidationResult {
	const missing = required.filter((field) => !(field in msg));
	return { ok: missing.length === 0, missing };
}

export function validateMessageType(
	msg: Record<string, unknown>,
	valid: Set<string>,
): boolean {
	return valid.has(String(msg.type || ""));
}

export function validateWorkerConnected(
	msg: Record<string, unknown>,
): ValidationResult {
	if (msg.type !== "connected") return { ok: false, missing: ["type"] };
	return validateRequiredFields(msg, ["type", "worker_id"]);
}

export function validateWorkspaceInfo(msg: Record<string, unknown>): boolean {
	return msg.type === "workspace_info" && typeof msg.workspace === "object";
}

export function validateAgentEvent(msg: Record<string, unknown>): boolean {
	if (msg.type !== "agent_event") return false;
	const event = msg.event as Record<string, unknown> | undefined;
	return !!event && typeof event.type === "string";
}

export function validateClientConnected(
	msg: Record<string, unknown>,
): ValidationResult {
	if (msg.type !== "connected") return { ok: false, missing: ["type"] };
	return validateRequiredFields(msg, ["client_id", "session_id"]);
}

export function validateInputRequest(
	msg: Record<string, unknown>,
): ValidationResult {
	if (!BRIDGE_REQUEST_TYPES.has(String(msg.type || "")))
		return { ok: false, missing: ["type"] };
	return validateRequiredFields(msg, ["id"]);
}

export function validateFileUploadStart(
	msg: Record<string, unknown>,
): ValidationResult {
	const required = ["type", "id", "file_id", "name", "total_chunks"];
	if (msg.type !== "file_upload_start") return { ok: false, missing: ["type"] };
	return validateRequiredFields(msg, required);
}

export function validateFileUploadChunk(
	msg: Record<string, unknown>,
): ValidationResult {
	const required = ["type", "file_id", "chunk_index", "data"];
	if (msg.type !== "file_upload_chunk") return { ok: false, missing: ["type"] };
	return validateRequiredFields(msg, required);
}
