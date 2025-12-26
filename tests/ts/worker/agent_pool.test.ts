import { describe, expect, test } from "bun:test";
import { AgentPool } from "../../../src/worker/agents/pool";
import type {
	AgentPlugin,
	AgentProcess,
} from "../../../src/worker/agents/types";

class FakeProcess implements AgentProcess {
	pid = 1;
	isRunning = false;
	isBusy = false;
	isIdleExpired = false;
	idleSeconds = 0;
	thread_id: string | null = null;
	currentTaskIdValue: string | null = null;

	private events: Array<Record<string, unknown>>;
	private lastTaskDesc: string | null = null;
	resumeCalls: string[] = [];
	updateCalls: Array<{ message: string; title?: string }> = [];
	cancelCalls = 0;
	stopCalls = 0;

	constructor(events: Array<Record<string, unknown>>) {
		this.events = events;
	}

	getStatus(): { tasks: Array<Record<string, unknown>> } {
		if (!this.currentTaskIdValue) return { tasks: [] };
		return {
			tasks: [
				{
					id: this.currentTaskIdValue,
					description: this.lastTaskDesc,
					status: this.isBusy ? "running" : "completed",
					created_at: 1,
					duration_ms: 1,
					current_tool: null,
					events: [],
				},
			],
		};
	}

	getLastTaskDescription(): string | null {
		return this.lastTaskDesc;
	}

	getTask(_taskId: string) {
		return undefined;
	}

	async updateTask(message: string, title?: string): Promise<string> {
		this.updateCalls.push({ message, title });
		return "updated";
	}

	async cancel(): Promise<string> {
		this.cancelCalls += 1;
		return "cancelled";
	}

	async ensureRunning(): Promise<void> {}

	async stop(): Promise<void> {
		this.stopCalls += 1;
		this.isRunning = false;
	}

	async *execute(
		taskDesc: string,
		resumeThreadId?: string | null,
	): AsyncGenerator<Record<string, unknown>> {
		this.isRunning = true;
		this.isBusy = true;
		this.lastTaskDesc = taskDesc;
		if (!this.currentTaskIdValue) this.currentTaskIdValue = "task-1";
		if (!this.thread_id) this.thread_id = "thread-1";
		if (resumeThreadId) this.resumeCalls.push(resumeThreadId);

		const events = resumeThreadId ? [{ type: "done" }] : this.events;
		for (const event of events) {
			yield event;
		}

		this.isBusy = false;
		this.isRunning = false;
	}
}

function buildPlugin(
	process: FakeProcess,
	afterTask?: (taskId: string) => void,
): AgentPlugin {
	return {
		name: "fake",
		supports: { jsonStreaming: false, threadResume: true, mcp: false },
		buildCommand: () => [],
		parseEvent: () => null,
		hooks: {
			async afterTask(ctx) {
				afterTask?.(ctx.taskId);
			},
		},
		createProcess: () => process,
	};
}

describe("AgentPool", () => {
	test("execute records task/thread and runs afterTask hook", async () => {
		const events = [
			{ task_id: "task-1" },
			{ thread_id: "thread-1" },
			{ type: "done" },
		];
		const fake = new FakeProcess(events);
		let afterTaskCalls = 0;
		const plugin = buildPlugin(fake, (taskId) => {
			afterTaskCalls += 1;
			expect(taskId).toBe("task-1");
		});

		const pool = new AgentPool(plugin, 1);
		const seen: Array<Record<string, unknown>> = [];
		for await (const event of pool.execute("do work")) {
			seen.push(event);
		}

		expect(seen.length).toBe(3);
		expect(afterTaskCalls).toBe(1);
		expect(pool.getWorkerForTask("task-1")).toBeUndefined();
	});

	test("update resumes by thread id when task is idle", async () => {
		const events = [
			{ task_id: "task-1" },
			{ thread_id: "thread-1" },
			{ type: "done" },
		];
		const fake = new FakeProcess(events);
		const plugin = buildPlugin(fake);
		const pool = new AgentPool(plugin, 1);

		for await (const _event of pool.execute("seed")) {
			// exhaust
		}

		const result = await pool.update("task-1", "ping");
		expect(result).toBe("Resumed thread with update");
		expect(fake.resumeCalls).toEqual(["thread-1"]);
	});

	test("cancel missing task returns not found", async () => {
		const fake = new FakeProcess([]);
		const plugin = buildPlugin(fake);
		const pool = new AgentPool(plugin, 1);

		const result = await pool.cancel("nope");
		expect(result).toBe("Task nope not found");
	});

	test("update with no tasks returns message", async () => {
		const fake = new FakeProcess([]);
		const plugin = buildPlugin(fake);
		const pool = new AgentPool(plugin, 1);

		const result = await pool.update(null, "ping");
		expect(result).toBe("No tasks running to update");
	});

	test("cleanupIdleWorkers stops idle processes", async () => {
		const fake = new FakeProcess([]);
		fake.isIdleExpired = true;
		const plugin = buildPlugin(fake);
		const pool = new AgentPool(plugin, 1);

		for await (const _event of pool.execute("seed")) {
			// create worker
		}
		fake.isIdleExpired = true;

		const stopped = await pool.cleanupIdleWorkers();
		expect(stopped).toBe(1);
		expect(fake.stopCalls).toBe(1);
	});
});
