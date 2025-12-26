export function formatSystemMessage(message: string, taskId?: string): string {
	const taskPrefix = taskId ? `[Task ${taskId}] ` : "";
	return `[SYSTEM] ${taskPrefix}${message}`;
}

export function formatWorkerMessage(message: string, taskId?: string): string {
	const taskPrefix = taskId ? `[Task ${taskId}] ` : "";
	return `[WORKER] ${taskPrefix}${message}`;
}
