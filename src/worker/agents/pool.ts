import { WORKSPACE_DIR } from "../config";
import type { AgentPlugin, AgentProcess } from "./types";

export class AgentPool {
	private max: number;
	private plugin: AgentPlugin;
	private workers: AgentProcess[] = [];
	private taskToWorker = new Map<string, AgentProcess>();
	private taskToThread = new Map<string, string>();
	private lock = Promise.resolve();

	constructor(plugin: AgentPlugin, maxWorkers = 3) {
		this.plugin = plugin;
		this.max = maxWorkers;
	}

	get activeCount(): number {
		return this.workers.filter((worker) => worker.isBusy).length;
	}

	get totalCount(): number {
		return this.workers.length;
	}

	getWorkerForTask(taskId: string): AgentProcess | undefined {
		return this.taskToWorker.get(taskId);
	}

	getStatus(): { tasks: Array<Record<string, unknown>> } {
		const tasks: Array<Record<string, unknown>> = [];
		for (const worker of this.workers) {
			tasks.push(...worker.getStatus().tasks);
		}
		tasks.sort((a, b) => (b.created_at as number) - (a.created_at as number));
		return { tasks };
	}

	getCurrentTaskId(): string | null {
		for (const worker of this.workers) {
			if (worker.isBusy && worker.currentTaskIdValue) {
				return worker.currentTaskIdValue;
			}
		}
		return null;
	}

	async *execute(taskDesc: string): AsyncGenerator<Record<string, unknown>> {
		yield* this.executeInternal(taskDesc);
	}

	async *resume(
		sessionId: string,
		message?: string,
	): AsyncGenerator<Record<string, unknown>> {
		const prompt = message || "Continue where you left off.";
		yield* this.executeInternal(prompt, sessionId);
	}

	async cancel(taskId?: string | null): Promise<string> {
		if (taskId) {
			const worker = this.taskToWorker.get(taskId);
			if (worker) {
				const result = await worker.cancel();
				this.taskToWorker.delete(taskId);
				return result;
			}
			return `Task ${taskId} not found`;
		}

		const busy = this.workers.filter((worker) => worker.isBusy);
		if (busy.length === 0) return "No tasks running";
		const latest = busy.reduce((prev, curr) => {
			const prevTask = prev.getStatus().tasks[0];
			const currTask = curr.getStatus().tasks[0];
			return (currTask?.created_at || 0) > (prevTask?.created_at || 0)
				? curr
				: prev;
		});
		const result = await latest.cancel();
		for (const [id, worker] of this.taskToWorker.entries()) {
			if (worker === latest) {
				this.taskToWorker.delete(id);
				break;
			}
		}
		return result;
	}

	async update(
		taskId: string | null | undefined,
		message: string,
		title?: string,
	): Promise<string> {
		if (taskId) {
			const worker = this.taskToWorker.get(taskId);
			if (worker?.isRunning) {
				return worker.updateTask(message, title);
			}

			const threadId = this.taskToThread.get(taskId);
			if (threadId) {
				console.log(`[pool] Resuming thread ${threadId} for task ${taskId}`);
				for await (const event of this.executeInternal(message, threadId)) {
					if (event.type === "done") {
						return "Resumed thread with update";
					}
					if (event.type === "error") {
						return `Error resuming: ${String(event.error)}`;
					}
				}
				return "Resumed thread";
			}
		}

		const busy = this.workers.filter((worker) => worker.isBusy);
		if (busy.length === 0) return "No tasks running to update";
		const latest = busy.reduce((prev, curr) => {
			const prevTask = prev.getStatus().tasks[0];
			const currTask = curr.getStatus().tasks[0];
			return (currTask?.created_at || 0) > (prevTask?.created_at || 0)
				? curr
				: prev;
		});
		return latest.updateTask(message, title);
	}

	async stopAll(): Promise<void> {
		for (const worker of this.workers) {
			await worker.stop();
		}
		this.workers = [];
		this.taskToWorker.clear();
	}

	async cleanupIdleWorkers(): Promise<number> {
		let stopped = 0;
		for (const worker of this.workers) {
			if (worker.isIdleExpired) {
				console.log(
					`[pool] Stopping idle worker (thread ${worker.thread_id}, idle ${worker.idleSeconds.toFixed(0)}s)`,
				);
				await worker.stop();
				stopped += 1;
			}
		}
		return stopped;
	}

	private async *executeInternal(
		taskDesc: string,
		resumeThreadId?: string,
	): AsyncGenerator<Record<string, unknown>> {
		const worker = await this.getOrCreateWorker();
		let taskId: string | null = null;
		let threadId: string | null = null;

		for await (const event of worker.execute(taskDesc, resumeThreadId)) {
			if (!taskId && typeof event.task_id === "string") {
				taskId = event.task_id;
				this.taskToWorker.set(taskId, worker);
			}
			if (!threadId && typeof event.thread_id === "string") {
				threadId = event.thread_id;
				if (taskId && threadId) this.taskToThread.set(taskId, threadId);
			}
			yield event;
		}

		if (taskId) {
			this.taskToWorker.delete(taskId);
			if (this.plugin.hooks.afterTask) {
				try {
					await this.plugin.hooks.afterTask({
						workspaceDir: WORKSPACE_DIR,
						taskId,
					});
				} catch (err) {
					console.log(`[pool] afterTask hook failed: ${err}`);
				}
			}
		}
	}

	private async getOrCreateWorker(): Promise<AgentProcess> {
		await this.lock;
		const idle = this.workers.find((worker) => !worker.isBusy);
		if (idle) return idle;
		if (this.workers.length < this.max) {
			const worker = this.plugin.createProcess();
			this.workers.push(worker);
			return worker;
		}
		return this.waitForIdleWorker();
	}

	private async waitForIdleWorker(): Promise<AgentProcess> {
		while (true) {
			const idle = this.workers.find((worker) => !worker.isBusy);
			if (idle) return idle;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}
