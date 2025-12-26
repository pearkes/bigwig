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
	started_at: number;
	completed_at?: number;
	status: ToolStatus;
}

export interface TaskRecord {
	id: string;
	thread_id?: string;
	description: string;
	status: TaskStatus;
	created_at: number;
	started_at?: number;
	completed_at?: number;
	duration_ms?: number;
	result_text?: string;
	error?: string;
	current_tool?: string | null;
	tool_history: ToolInvocation[];
}

export type AgentEvent =
	| { type: "connected"; ts: number }
	| {
			type: "task_start";
			ts: number;
			task_id: string;
			thread_id?: string;
			task: string;
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
	| { type: "task_cancelled"; ts: number; task_id: string; task?: string }
	| {
			type: "task_update";
			ts: number;
			task_id: string;
			message: string;
			title?: string;
	  };

export function newTaskId(): string {
	return `t_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
