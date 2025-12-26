import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTaskPrefix } from "../../../shared/prompts";
import {
	newTaskId,
	type TaskRecord,
	type ToolInvocation,
} from "../../../shared/tasks";
import { nowMs } from "../../../shared/utils";
import { getToolDocs } from "../../../tools/registry";
import { BRIDGE_PORT, WORKSPACE_DIR } from "../../config";
import { emitAgentEvent } from "../events";
import { runCommand } from "./command";

function formatToolInput(name: string, input: Record<string, unknown>): string {
	if (name === "Bash") {
		return String(input.cmd || "");
	}
	if (name === "Read") {
		const path = String(input.path || "");
		return path.includes("/workspace/")
			? path.split("/workspace/").pop() || path
			: path;
	}
	if (name === "edit_file" || name === "create_file") {
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
	if (name === "read_web_page" || name === "web_search") {
		return String(input.url || input.objective || "").slice(0, 80);
	}
	if (name === "glob") {
		return String(input.filePattern || "");
	}
	if (name === "finder") {
		return String(input.query || "").slice(0, 60);
	}
	for (const value of Object.values(input)) {
		if (typeof value === "string" && value) {
			return value.slice(0, 60);
		}
	}
	return "";
}

export class AmpProcess {
	private process: Bun.Subprocess | null = null;
	private stdinWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private stdoutReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private stdoutBuffer = "";
	private stdoutDecoder = new TextDecoder();
	private cancelled = false;
	private lastActivity = 0;
	private threadId: string | null = null;
	private tasks = new Map<string, TaskRecord>();
	private recentTaskIds: string[] = [];
	private currentTaskId: string | null = null;
	private lastTaskDescription: string | null = null;
	private taskIdFilePath: string | null = null;

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
			Date.now() - this.lastActivity > AmpProcess.IDLE_TIMEOUT_SECONDS * 1000
		);
	}

	get idleSeconds(): number {
		if (this.isBusy || this.lastActivity === 0) return 0;
		return (Date.now() - this.lastActivity) / 1000;
	}

	get thread_id(): string | null {
		return this.threadId;
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

	async updateTask(message: string, title?: string): Promise<string> {
		const task = this.getCurrentTask();
		if (!task) return "No task running to update";

		if (!this.process || !this.process.stdin) {
			return "Process not running";
		}

		if (title) {
			task.description = title;
			console.log(
				`[amp] Updated task ${task.id} title to: ${title.slice(0, 50)}...`,
			);
		}

		emitAgentEvent({
			type: "task_update",
			ts: nowMs(),
			task_id: task.id,
			message,
			title,
		});

		const userMessage = {
			type: "user",
			message: {
				role: "user",
				content: [{ type: "text", text: message }],
			},
		};

		await this.writeToStdin(`${JSON.stringify(userMessage)}\n`);
		return `Update sent to task: ${task.description.slice(0, 50)}`;
	}

	async cancel(): Promise<string> {
		const task = this.getCurrentTask();
		if (!task) return "No task running";

		this.cancelled = true;
		console.log(
			`[amp] Cancelling task ${task.id}: ${task.description.slice(0, 50)}...`,
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

	async ensureRunning(resumeThreadId?: string | null): Promise<void> {
		if (this.isRunning) return;

		this.ensureTaskIdFile();

		if (resumeThreadId) {
			console.log(`[amp] Resuming thread ${resumeThreadId}...`);
		} else {
			console.log("[amp] Starting new thread...");
		}

		const env = {
			...process.env,
			BIGWIG_BRIDGE_URL: `ws://127.0.0.1:${BRIDGE_PORT}`,
			BIGWIG_WORKSPACE_DIR: WORKSPACE_DIR,
			BIGWIG_TASK_ID_FILE: this.taskIdFilePath || undefined,
		};

		const cmd = resumeThreadId
			? [
					"amp",
					"threads",
					"continue",
					resumeThreadId,
					"-x",
					"--stream-json",
					"--stream-json-input",
					"--dangerously-allow-all",
				]
			: [
					"amp",
					"-x",
					"--stream-json",
					"--stream-json-input",
					"--dangerously-allow-all",
				];

		this.process = Bun.spawn(cmd, {
			cwd: WORKSPACE_DIR,
			env,
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});

		if (this.process.stdin) {
			const stdinStream = this.process.stdin as WritableStream<Uint8Array>;
			if (typeof stdinStream.getWriter === "function") {
				this.stdinWriter = stdinStream.getWriter();
			}
		}

		if (this.process.stdout) {
			this.stdoutReader = this.process.stdout.getReader();
		}

		if (!this.stdoutReader) return;

		while (true) {
			const line = await this.readLine();
			if (line === null) break;
			if (!line) continue;
			try {
				const event = JSON.parse(line) as Record<string, unknown>;
				if (event.type === "system" && typeof event.session_id === "string") {
					this.threadId = event.session_id;
					console.log(`[amp] Thread: ${this.threadId} (PID: ${this.pid})`);
					break;
				}
			} catch {}
		}
	}

	async stop(): Promise<void> {
		if (this.process) {
			console.log("[amp] Stopping process...");
			this.process.kill();
			this.process = null;
			this.threadId = null;
			this.stdinWriter = null;
			this.stdoutReader = null;
			this.stdoutBuffer = "";
		}
	}

	async *execute(
		taskDesc: string,
		resumeThreadId?: string | null,
	): AsyncGenerator<Record<string, unknown>> {
		const start = Date.now();
		this.cancelled = false;

		const task = this.createTask(taskDesc);
		const taskId = task.id;

		await this.ensureRunning(resumeThreadId || undefined);
		task.thread_id = this.threadId || undefined;

		if (!this.process || !this.process.stdin || !this.process.stdout) {
			this.currentTaskId = null;
			task.status = "error";
			task.error = "Process not running";
			yield { type: "error", error: "Process not running", task_id: taskId };
			return;
		}

		console.log(
			`[amp] Task ${taskId} (thread ${this.threadId}): ${taskDesc.slice(0, 50)}...`,
		);

		emitAgentEvent({
			type: "task_start",
			ts: task.started_at || nowMs(),
			task_id: taskId,
			thread_id: this.threadId,
			task: taskDesc,
		});

		const toolDocs = getToolDocs();
		const skillsList = await this.getSkillsList();
		const fullTask = buildTaskPrefix(toolDocs, skillsList) + taskDesc;

		const message = {
			type: "user",
			message: { role: "user", content: [{ type: "text", text: fullTask }] },
		};

		await this.writeToStdin(`${JSON.stringify(message)}\n`);

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

			const eventType = event.type as string | undefined;
			if (eventType === "assistant") {
				const msg = event.message as Record<string, unknown> | undefined;
				const content = (msg?.content as Array<Record<string, unknown>>) || [];
				for (const part of content) {
					if (part.type === "text") {
						const text = String(part.text || "");
						if (text) {
							fullText = text;
							yield { type: "delta", text, task_id: taskId };
						}
					} else if (part.type === "tool_use") {
						const toolName = String(part.name || "unknown");
						const toolInput = (part.input as Record<string, unknown>) || {};
						const inputStr = formatToolInput(toolName, toolInput);
						const now = nowMs();

						const toolInv: ToolInvocation = {
							name: toolName,
							input: inputStr,
							started_at: now,
							status: "running",
						};
						task.current_tool = toolName;
						task.tool_history.push(toolInv);

						console.log(`[amp] Tool: ${toolName} ${inputStr.slice(0, 50)}`);
						emitAgentEvent({
							type: "tool_use",
							ts: now,
							task_id: taskId,
							name: toolName,
							input: inputStr,
						});
						yield {
							type: "tool_use",
							name: toolName,
							input: inputStr,
							task_id: taskId,
						};
					}
				}

				if (msg?.stop_reason === "end_turn") {
					this.currentTaskId = null;
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
					console.log(`[amp] Done in ${duration}ms`);
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

					return;
				}
			} else if (eventType === "result") {
				this.currentTaskId = null;
				const duration =
					typeof event.duration_ms === "number"
						? event.duration_ms
						: Date.now() - start;
				const now = nowMs();
				console.log(`[amp] Result in ${duration}ms`);

				if (event.is_error) {
					task.status = "error";
					task.error = String(event.error || "Unknown error");
					task.completed_at = now;
					yield { type: "error", error: task.error, task_id: taskId };
				} else {
					task.status = "completed";
					task.completed_at = now;
					task.duration_ms = duration;
					task.result_text = String(event.result || fullText);
					this.lastActivity = Date.now();
					emitAgentEvent({
						type: "task_done",
						ts: now,
						task_id: taskId,
						duration_ms: duration,
						text: String(event.result || fullText),
					});
					yield {
						type: "done",
						text: String(event.result || fullText),
						duration_ms: duration,
						task_id: taskId,
					};
				}
				return;
			}
		}

		if (this.cancelled) {
			yield { type: "cancelled", task_id: taskId };
		} else {
			task.status = "error";
			task.error = "Process ended";
			yield { type: "error", error: "Process ended", task_id: taskId };
		}
		this.process = null;
	}

	private createTask(description: string): TaskRecord {
		const now = nowMs();
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
				console.log(`[amp] Failed to write task id file: ${err}`);
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
			console.log(`[amp] Failed to initialize task id file: ${err}`);
			this.taskIdFilePath = null;
		}
	}

	private getCurrentTask(): TaskRecord | null {
		if (!this.currentTaskId) return null;
		return this.tasks.get(this.currentTaskId) || null;
	}

	private async getSkillsList(): Promise<string> {
		const result = await runCommand(["amp", "skills", "list"], WORKSPACE_DIR);
		if (!result.ok) {
			if (result.stderr.trim()) {
				console.log(`[amp] Skills list failed: ${result.stderr.trim()}`);
			}
			return "";
		}
		return result.stdout.trim();
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

	private async writeToStdin(data: string): Promise<void> {
		if (!this.process?.stdin) return;
		const writable = this.process.stdin as { write?: (chunk: string) => void };
		if (typeof writable.write === "function") {
			writable.write(data);
			return;
		}
		if (this.stdinWriter) {
			await this.stdinWriter.write(new TextEncoder().encode(data));
		}
	}
}
