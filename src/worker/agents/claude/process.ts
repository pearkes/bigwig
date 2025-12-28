import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	newTaskId,
	type TaskRecord,
	type ToolInvocation,
} from "../../../shared/tasks";
import { nowMs } from "../../../shared/utils";
import { WORKSPACE_DIR } from "../../config";
import { emitAgentEvent } from "../events";

function formatToolInput(name: string, input: Record<string, unknown>): string {
	if (name === "Bash") {
		return String(input.command || input.cmd || "");
	}
	if (name === "Read") {
		const path = String(input.path || "");
		return path.includes("/workspace/")
			? path.split("/workspace/").pop() || path
			: path;
	}
	if (
		name === "Edit" ||
		name === "Write" ||
		name === "edit_file" ||
		name === "create_file"
	) {
		const path = String(input.path || "");
		return path.includes("/workspace/")
			? path.split("/workspace/").pop() || path
			: path;
	}
	if (name === "Grep") {
		const pattern = String(input.pattern || "");
		const path = String(input.path || "");
		return `${pattern} in ${path}`;
	}
	if (name === "glob" || name === "Glob") {
		return String(input.filePattern || "");
	}
	for (const value of Object.values(input)) {
		if (typeof value === "string" && value) {
			return value.slice(0, 60);
		}
	}
	return "";
}

type ToolUse = {
	id?: string;
	name: string;
	input: Record<string, unknown>;
};

function coerceToolInput(input: unknown): Record<string, unknown> {
	if (input && typeof input === "object" && !Array.isArray(input)) {
		return input as Record<string, unknown>;
	}
	if (input === undefined) return {};
	return { value: input };
}

function extractToolUses(event: Record<string, unknown>): ToolUse[] {
	const uses: ToolUse[] = [];
	const seen = new Set<string>();

	const addToolUse = (name: string, input: unknown, id?: string) => {
		if (!name) return;
		const coerced = coerceToolInput(input);
		let key = name;
		try {
			key += `:${JSON.stringify(coerced)}`;
		} catch {
			key += ":<unserializable>";
		}
		if (seen.has(key)) return;
		seen.add(key);
		uses.push({ id, name, input: coerced });
	};

	const type = event.type;
	if (type === "tool_use" || type === "tool_call") {
		addToolUse(String(event.name || ""), event.input, String(event.id || ""));
	}

	if (type === "content_block_start") {
		const block = event.content_block as Record<string, unknown> | undefined;
		if (block?.type === "tool_use" || block?.type === "tool_call") {
			addToolUse(
				String(block.name || ""),
				block.input,
				String(block.id || ""),
			);
		}
	}

	if (type === "content_block_delta") {
		const delta = event.delta as Record<string, unknown> | undefined;
		if (delta?.type === "tool_use" || delta?.type === "tool_call") {
			addToolUse(
				String(delta.name || ""),
				delta.input,
				String(delta.id || ""),
			);
		}
	}

	const contentBlock = event.content_block as Record<string, unknown> | undefined;
	if (contentBlock?.type === "tool_use" || contentBlock?.type === "tool_call") {
		addToolUse(
			String(contentBlock.name || ""),
			contentBlock.input,
			String(contentBlock.id || ""),
		);
	}

	const tool = event.tool as Record<string, unknown> | undefined;
	if (tool) {
		addToolUse(String(tool.name || ""), tool.input, String(tool.id || ""));
	}

	const message = event.message as Record<string, unknown> | undefined;
	const content = message?.content as Array<Record<string, unknown>> | undefined;
	if (Array.isArray(content)) {
		for (const part of content) {
			if (part.type === "tool_use" || part.type === "tool_call") {
				addToolUse(String(part.name || ""), part.input, String(part.id || ""));
			}
		}
	}

	return uses;
}

function extractToolResultIds(event: Record<string, unknown>): string[] {
	const ids: string[] = [];
	const type = event.type;
	if (type === "tool_result" && typeof event.tool_use_id === "string") {
		ids.push(event.tool_use_id);
	}

	const message = event.message as Record<string, unknown> | undefined;
	const content = message?.content as Array<Record<string, unknown>> | undefined;
	if (Array.isArray(content)) {
		for (const part of content) {
			if (part.type === "tool_result" && typeof part.tool_use_id === "string") {
				ids.push(part.tool_use_id);
			}
		}
	}

	if (typeof event.tool_use_id === "string") {
		ids.push(event.tool_use_id);
	}

	return ids;
}

function extractResultText(event: Record<string, unknown>): string | null {
	if (event.type === "result" && typeof event.result === "string") {
		return event.result;
	}
	return null;
}

function extractTextDelta(event: Record<string, unknown>): string | null {
	if (typeof event.text === "string" && event.text) return event.text;

	if (event.type === "content_block_delta") {
		const delta = event.delta as Record<string, unknown> | undefined;
		if (delta?.type === "text_delta" && typeof delta.text === "string") {
			return delta.text;
		}
		if (typeof delta?.text === "string") return delta.text;
	}

	if (event.type === "content_block_start") {
		const block = event.content_block as Record<string, unknown> | undefined;
		if (block?.type === "text" && typeof block.text === "string") {
			return block.text;
		}
	}

	const message = event.message as Record<string, unknown> | undefined;
	const content = message?.content as
		| Array<Record<string, unknown>>
		| undefined;
	if (Array.isArray(content)) {
		for (const part of content) {
			if (part.type === "text" && typeof part.text === "string") {
				return part.text;
			}
		}
	}

	return null;
}

function extractSessionId(event: Record<string, unknown>): string | null {
	const candidates = [
		event.session_id,
		event.sessionId,
		event.session,
		event.thread_id,
		event.threadId,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate) return candidate;
	}
	return null;
}

function isStopEvent(event: Record<string, unknown>): boolean {
	if (
		event.type === "message_stop" ||
		event.type === "result" ||
		event.type === "final"
	)
		return true;
	const stopReason =
		event.stop_reason ||
		(event.delta as Record<string, unknown> | undefined)?.stop_reason;
	return stopReason === "end_turn" || stopReason === "stop";
}

export class ClaudeProcess {
	private process: Bun.Subprocess | null = null;
	private stdoutReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private stdoutBuffer = "";
	private stdoutDecoder = new TextDecoder();
	private cancelled = false;
	private lastActivity = 0;
	private sessionId: string | null = null;
	private tasks = new Map<string, TaskRecord>();
	private recentTaskIds: string[] = [];
	private currentTaskId: string | null = null;
	private lastTaskDescription: string | null = null;
	private taskIdFilePath: string | null = null;
	private toolUseIdToIndex = new Map<string, number>();

	static IDLE_TIMEOUT_SECONDS = 60;

	get pid(): number | null {
		return this.process?.pid ?? null;
	}

	get isRunning(): boolean {
		return !!this.process && !this.process.killed;
	}

	get isBusy(): boolean {
		return this.currentTaskId !== null;
	}

	get isIdleExpired(): boolean {
		if (this.isBusy || !this.isRunning || this.lastActivity === 0) return false;
		return (
			Date.now() - this.lastActivity > ClaudeProcess.IDLE_TIMEOUT_SECONDS * 1000
		);
	}

	get idleSeconds(): number {
		if (this.isBusy || this.lastActivity === 0) return 0;
		return (Date.now() - this.lastActivity) / 1000;
	}

	get thread_id(): string | null {
		return this.sessionId;
	}

	get currentTaskIdValue(): string | null {
		return this.currentTaskId;
	}

	getStatus(): { tasks: Array<Record<string, unknown>> } {
		const rows: Array<Record<string, unknown>> = [];
		for (const id of this.recentTaskIds) {
			const task = this.tasks.get(id);
			if (!task) continue;
			rows.push({
				id: task.id,
				description: task.description,
				status: task.status,
				created_at: task.created_at,
				duration_ms: task.duration_ms,
				current_tool: task.current_tool,
				events: task.tool_history,
			});
		}
		return { tasks: rows };
	}

	getLastTaskDescription(): string | null {
		return this.lastTaskDescription;
	}

	getTask(taskId: string): TaskRecord | undefined {
		return this.tasks.get(taskId);
	}

	async updateTask(_message: string, _title?: string): Promise<string> {
		if (this.isRunning) {
			return "Update not supported while Claude task is running";
		}
		return "No task running to update";
	}

	async cancel(): Promise<string> {
		const task = this.getCurrentTask();
		if (!task) return "No task running";

		this.cancelled = true;
		console.log(
			`[claude] Cancelling task ${task.id}: ${task.description.slice(0, 50)}...`,
		);

		if (this.process) {
			this.process.kill();
		}

		const now = nowMs();
		task.status = "cancelled";
		task.completed_at = now;
		if (task.started_at) {
			task.duration_ms = now - task.started_at;
		}
		task.current_tool = null;

		emitAgentEvent({
			type: "task_cancelled",
			ts: now,
			task_id: task.id,
			task: task.description,
		});

		this.currentTaskId = null;
		return `Cancelled: ${task.description.slice(0, 50)}`;
	}

	async ensureRunning(): Promise<void> {
		return;
	}

	async stop(): Promise<void> {
		if (this.process) {
			console.log("[claude] Stopping process...");
			this.process.kill();
			this.process = null;
			this.sessionId = null;
			this.stdoutReader = null;
			this.stdoutBuffer = "";
		}
	}

	async *execute(
		taskDesc: string,
		resumeSessionId?: string | null,
	): AsyncGenerator<Record<string, unknown>> {
		const start = Date.now();
		this.cancelled = false;

		const task = this.createTask(taskDesc);
		const taskId = task.id;

		this.sessionId = resumeSessionId || crypto.randomUUID();
		task.thread_id = this.sessionId || undefined;

		const cmd = [
			"claude",
			"-p",
			taskDesc,
			"--verbose",
			"--output-format",
			"stream-json",
			"--dangerously-skip-permissions",
			"--chrome",
			...(resumeSessionId ? ["--resume", resumeSessionId] : []),
		];

		this.process = Bun.spawn(cmd, {
			cwd: WORKSPACE_DIR,
			env: {
				...process.env,
				BIGWIG_TASK_ID_FILE: this.taskIdFilePath || undefined,
			},
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});

		if (this.process.stdout) {
			this.stdoutReader = this.process.stdout.getReader();
		}

		if (!this.stdoutReader) {
			this.currentTaskId = null;
			task.status = "error";
			task.error = "Process not running";
			yield { type: "error", error: "Process not running", task_id: taskId };
			return;
		}

		console.log(
			`[claude] Task ${taskId} (session ${this.sessionId}): ${taskDesc.slice(0, 50)}...`,
		);

		emitAgentEvent({
			type: "task_start",
			ts: task.started_at || nowMs(),
			task_id: taskId,
			thread_id: this.sessionId || undefined,
			task: taskDesc,
		});

		const stderrPromise = this.process.stderr
			? new Response(this.process.stderr).text()
			: Promise.resolve("");
		let fullText = "";

		while (true) {
			const line = await this.readLine();
			if (line === null) break;
			if (!line) continue;
			let event: Record<string, unknown>;
			try {
				event = JSON.parse(line);
			} catch {
				continue;
			}

			const sessionId = extractSessionId(event);
			if (sessionId && !this.sessionId) this.sessionId = sessionId;

			const toolUses = extractToolUses(event);
			for (const toolUse of toolUses) {
				const inputStr = formatToolInput(toolUse.name, toolUse.input);
				const now = nowMs();
				const lastTool = task.tool_history[task.tool_history.length - 1];
				if (
					lastTool &&
					lastTool.status === "running" &&
					lastTool.name === toolUse.name &&
					lastTool.input === inputStr
				) {
					continue;
				}

				const toolInv: ToolInvocation = {
					name: toolUse.name,
					input: inputStr,
					started_at: now,
					status: "running",
				};
				task.current_tool = toolUse.name;
				task.tool_history.push(toolInv);
				if (toolUse.id) {
					this.toolUseIdToIndex.set(toolUse.id, task.tool_history.length - 1);
				}

				console.log(`[claude] Tool: ${toolUse.name} ${inputStr.slice(0, 50)}`);
				emitAgentEvent({
					type: "tool_use",
					ts: now,
					task_id: taskId,
					name: toolUse.name,
					input: inputStr,
				});
				yield {
					type: "tool_use",
					name: toolUse.name,
					input: inputStr,
					task_id: taskId,
				};
			}

			const toolResultIds = extractToolResultIds(event);
			if (toolResultIds.length > 0) {
				const now = nowMs();
				for (const toolUseId of toolResultIds) {
					const idx = this.toolUseIdToIndex.get(toolUseId);
					if (idx !== undefined) {
						const inv = task.tool_history[idx];
						if (inv && inv.status === "running") {
							inv.status = "completed";
							inv.completed_at = now;
						}
					}
				}
				if (task.tool_history.length > 0) {
					const last = task.tool_history[task.tool_history.length - 1];
					if (last.status === "running") {
						last.status = "completed";
						last.completed_at = now;
					}
				}
			}

			const delta = extractTextDelta(event);
			if (delta) {
				fullText += delta;
				yield { type: "delta", text: delta, task_id: taskId };
			}

			const resultText = extractResultText(event);
			if (resultText && !fullText) {
				fullText = resultText;
				yield { type: "delta", text: resultText, task_id: taskId };
			}

			if (isStopEvent(event)) {
				break;
			}
		}

		const exitCode = await this.process.exited;
		const stderr = await stderrPromise;
		this.process = null;
		this.currentTaskId = null;

		if (this.cancelled) {
			yield { type: "cancelled", task_id: taskId };
			return;
		}

		if (exitCode !== 0) {
			const now = nowMs();
			task.status = "error";
			task.error = stderr.trim() || `Process exited with code ${exitCode}`;
			task.completed_at = now;
			task.current_tool = null;
			yield { type: "error", error: task.error, task_id: taskId };
			return;
		}

		const duration = Date.now() - start;
		const now = nowMs();
		task.status = "completed";
		task.completed_at = now;
		task.duration_ms = duration;
		task.result_text = fullText;
		task.current_tool = null;

		if (task.tool_history.length > 0) {
			const last = task.tool_history[task.tool_history.length - 1];
			last.status = "completed";
			last.completed_at = now;
		}

		this.lastActivity = Date.now();
		emitAgentEvent({
			type: "task_done",
			ts: now,
			task_id: taskId,
			duration_ms: duration,
			text: fullText,
		});
		yield {
			type: "done",
			text: fullText,
			duration_ms: duration,
			task_id: taskId,
		};
	}

	private createTask(description: string): TaskRecord {
		const now = nowMs();
		this.toolUseIdToIndex.clear();
		const task: TaskRecord = {
			id: newTaskId(),
			description,
			status: "running",
			created_at: now,
			started_at: now,
			tool_history: [],
		};
		this.tasks.set(task.id, task);
		this.recentTaskIds.push(task.id);
		if (this.recentTaskIds.length > 50) {
			this.recentTaskIds.shift();
		}
		this.currentTaskId = task.id;
		this.lastTaskDescription = description;
		this.ensureTaskIdFile();
		if (this.taskIdFilePath) {
			try {
				writeFileSync(this.taskIdFilePath, task.id);
			} catch (err) {
				console.log(`[claude] Failed to write task id file: ${err}`);
			}
		}
		return task;
	}

	private ensureTaskIdFile(): void {
		if (this.taskIdFilePath) return;
		const dir = join(WORKSPACE_DIR, ".bigwig");
		try {
			mkdirSync(dir, { recursive: true });
			this.taskIdFilePath = join(
				dir,
				`task_id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			);
			writeFileSync(this.taskIdFilePath, "");
		} catch (err) {
			console.log(`[claude] Failed to initialize task id file: ${err}`);
			this.taskIdFilePath = null;
		}
	}

	private getCurrentTask(): TaskRecord | null {
		if (!this.currentTaskId) return null;
		return this.tasks.get(this.currentTaskId) || null;
	}

	private async readLine(): Promise<string | null> {
		if (!this.stdoutReader) return null;
		while (true) {
			const newlineIndex = this.stdoutBuffer.indexOf("\n");
			if (newlineIndex >= 0) {
				const line = this.stdoutBuffer.slice(0, newlineIndex);
				this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
				return line;
			}
			const { value, done } = await this.stdoutReader.read();
			if (done) {
				if (this.stdoutBuffer.length > 0) {
					const remaining = this.stdoutBuffer;
					this.stdoutBuffer = "";
					return remaining;
				}
				return null;
			}
			this.stdoutBuffer += this.stdoutDecoder.decode(value, { stream: true });
		}
	}
}
