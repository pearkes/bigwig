/**
 * Shared task and event types for bigwig.
 *
 * These types define the contract between worker, web server, and client.
 * Keep in sync with src/shared/tasks.ts
 */

export type TaskStatus =
	| "pending"
	| "running"
	| "completed"
	| "cancelled"
	| "error";
export type ToolStatus = "running" | "completed" | "error";

export interface ToolInvocation {
	name: string;
	input?: string;
	started_at: number; // ms since epoch
	completed_at?: number;
	status: ToolStatus;
}

export interface Task {
	id: string;
	description: string;
	status: TaskStatus;
	created_at: number; // ms since epoch
	started_at?: number;
	completed_at?: number;
	duration_ms?: number;
	result_text?: string;
	error?: string;
	current_tool?: string;
	tool_history: ToolInvocation[];
	dismissed_at?: number; // client-only UI state
}

// Agent events received via WebSocket
export type AgentEvent =
	// Internal/Status events
	| { type: "connected"; ts: number }
	| {
			type: "task_start";
			ts: number;
			task_id: string;
			task: string; // description
	  }
	| {
			type: "tool_use";
			ts: number;
			task_id: string;
			name: string;
			input?: string;
	  }
	| {
			type: "task_done";
			ts: number;
			task_id: string;
			duration_ms: number;
			text: string;
	  }
	| {
			type: "task_cancelled";
			ts: number;
			task_id: string;
			task?: string;
	  }
	| {
			type: "task_update";
			ts: number;
			task_id: string;
			message: string;
			title?: string;
	  }
	// Content events
	| {
			type: "file";
			id: string;
			ts: number;
			task_id?: string;
			name: string;
			mime: string;
			data: string; // base64-encoded
			size?: number;
			description?: string;
	  }
	| {
			type: "file_start";
			id: string;
			ts: number;
			task_id?: string;
			file_id: string;
			name: string;
			mime: string;
			size: number;
			total_chunks: number;

			description?: string;
	  }
	| {
			type: "file_chunk";
			id: string;
			ts: number;
			task_id?: string;
			file_id: string;
			chunk_index: number;
			data: string; // base64-encoded chunk
	  }
	| {
			type: "message";
			id: string;
			ts: number;
			task_id?: string;
			text: string;
			format?: "plain" | "markdown" | "html";
			title?: string;
	  }
	| {
			type: "link";
			id: string;
			ts: number;
			task_id?: string;
			url: string;
			title?: string;
			description?: string;
			image?: string;
	  }
	| {
			type: "code";
			id: string;
			ts: number;
			task_id?: string;
			content: string;
			language?: string;
			filename?: string;
	  }
	| {
			type: "list";
			id: string;
			ts: number;
			task_id?: string;
			title?: string;
			items: Array<{ text: string; url?: string }>;
	  }
	| {
			type: "input_request";
			id: string;
			ts: number;
			task_id?: string;
			prompt: string;
			input_type?: "text" | "select" | "confirm";
			options?: string[];
			default?: string;
			timeout_seconds?: number;
	  }
	| {
			type: "form_request";
			id: string;
			ts: number;
			task_id?: string;
			prompt?: string;
			form: import("./forms").FormSchema;
			timeout_seconds?: number;
	  }
	| {
			type: "progress";
			id: string;
			ts: number;
			task_id: string;
			status: "starting" | "running" | "complete" | "error";
			message?: string;
			percent?: number;
	  }
	| {
			type: "error";
			id: string;
			ts: number;
			task_id?: string;
			message: string;
			recoverable?: boolean;
			suggestion?: string;
	  }
	// File request - agent asks user for a file/photo
	| {
			type: "file_request";
			id: string;
			ts: number;
			task_id?: string;
			prompt: string;
			file_type: "any" | "image" | "document" | "photo";
			open_camera?: boolean;
			required?: boolean;
			timeout_seconds?: number;
	  };

// Content card type - union of content event types for UI rendering
// Only message and error are currently emitted by the worker
export type ContentCard = Extract<AgentEvent, { type: "message" | "error" }>;

// Pending file state for chunked loading
export interface PendingFile {
	file_id: string;
	name: string;
	mime: string;
	size: number;
	totalChunks: number;
	receivedChunks: Map<number, string>;
	description?: string;
	startedAt: number;
}

// Input request type for convenience
export type InputRequestEvent = Extract<AgentEvent, { type: "input_request" }>;

// Form request type for convenience
export type FormRequestEvent = Extract<AgentEvent, { type: "form_request" }>;

// File request type for convenience
export type FileRequestEvent = Extract<AgentEvent, { type: "file_request" }>;

// File upload events (client → server, not part of AgentEvent)
export interface FileUploadStartEvent {
	type: "file_upload_start";
	id: string;
	ts: number;
	file_id: string;
	name: string;
	mime: string;
	size: number;
	total_chunks: number;
}

export interface FileUploadChunkEvent {
	type: "file_upload_chunk";
	id: string;
	ts: number;
	file_id: string;
	chunk_index: number;
	data: string; // base64-encoded chunk
}

// Helper to create an empty task (for optimistic UI if needed)
export function createPendingTask(id: string, description: string): Task {
	const now = Date.now();
	return {
		id,
		description,
		status: "pending",
		created_at: now,
		started_at: now,
		tool_history: [],
	};
}
