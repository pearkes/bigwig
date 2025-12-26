import type { Task } from "../types/tasks";
import type { TaskCard } from "../types/ui";

export const isTaskActive = (status: Task["status"]) =>
	status === "running" || status === "pending";

export const isTaskPending = (status: Task["status"]) => status === "pending";

export const isTaskCancelled = (status: Task["status"]) =>
	status === "cancelled";

export const isTaskCompleted = (status: Task["status"]) =>
	status === "completed";

export const buildTaskCard = (task: Task): TaskCard => ({
	...task,
	startTime: new Date(task.started_at ?? task.created_at),
	endTime: task.completed_at ? new Date(task.completed_at) : undefined,
	task: task.description,
	durationMs: task.duration_ms,
	result: task.result_text,
});
