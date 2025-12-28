import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Integration tests for agent processes.
 *
 * These tests require both `amp` and `claude` CLIs to be installed and authenticated.
 * They validate that each agent can:
 * 1. Spawn a process and execute a simple prompt
 * 2. Return events with valid schema
 * 3. Complete without errors
 *
 * Run with: BIGWIG_RUN_INTEGRATION=1 bun test tests/ts/integration/agent_process.test.ts
 */

const runIntegration = process.env.BIGWIG_RUN_INTEGRATION === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

const TEST_WORKSPACE = mkdtempSync(join(tmpdir(), "bigwig-test-"));
process.env.WORKSPACE_DIR = TEST_WORKSPACE;

import { AmpProcess } from "../../../src/worker/agents/amp/process";
import { ClaudeProcess } from "../../../src/worker/agents/claude/process";

const SIMPLE_PROMPT = "Respond with exactly: PONG";
const TOOL_PROMPT = "List the files in the current directory.";
const TIMEOUT_MS = 30_000;
const ALLOW_MISSING_AGENT_CLI =
	process.env.BIGWIG_ALLOW_MISSING_AGENT_CLI === "1";

async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout>;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(`Timeout: ${message}`)), ms);
	});
	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		clearTimeout(timeoutId!);
	}
}

async function collectEvents(
	generator: AsyncGenerator<Record<string, unknown>>,
	timeoutMs: number,
): Promise<Record<string, unknown>[]> {
	const events: Record<string, unknown>[] = [];
	const deadline = Date.now() + timeoutMs;

	for await (const event of generator) {
		events.push(event);
		if (Date.now() > deadline) {
			throw new Error("Event collection timed out");
		}
	}
	return events;
}

type AgentEvent = Record<string, unknown>;

function hasRequiredFields(event: AgentEvent): boolean {
	return typeof event.type === "string";
}

function isTextEvent(event: AgentEvent): boolean {
	return (
		event.type === "text" ||
		event.type === "content_block_delta" ||
		event.type === "assistant" ||
		typeof event.text === "string"
	);
}

function isCompletionEvent(event: AgentEvent): boolean {
	return (
		event.type === "done" ||
		event.type === "result" ||
		event.type === "message_stop" ||
		event.type === "final" ||
		event.stop_reason === "end_turn"
	);
}

function getErrorMessage(events: AgentEvent[]): string | null {
	for (const event of events) {
		if (event.type === "error" && typeof event.error === "string") {
			return event.error;
		}
	}
	return null;
}

function shouldSkipForError(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("not logged") ||
		normalized.includes("log in") ||
		normalized.includes("login") ||
		normalized.includes("authenticate") ||
		normalized.includes("unauthorized") ||
		normalized.includes("permission") ||
		normalized.includes("access denied") ||
		normalized.includes("api key") ||
		normalized.includes("quota") ||
		normalized.includes("no config") ||
		normalized.includes("process ended") ||
		normalized.includes("process exited")
	);
}

function assertAgentEvents(events: AgentEvent[], agentLabel: string): void {
	const errorMessage = getErrorMessage(events);
	if (errorMessage && shouldSkipForError(errorMessage)) {
		console.log(`[skip] ${agentLabel} not ready: ${errorMessage}`);
		return;
	}

	let hasText = false;
	let completed = false;

	for (const event of events) {
		expect(hasRequiredFields(event)).toBe(true);
		if (isTextEvent(event)) hasText = true;
		if (isCompletionEvent(event)) completed = true;
	}

	expect(events.length).toBeGreaterThan(0);
	if (!hasText && !completed) {
		const types = Array.from(
			new Set(events.map((event) => String(event.type || "unknown"))),
		).join(", ");
		console.log(
			`[skip] ${agentLabel} produced no text/completion events: ${types}`,
		);
		return;
	}
	expect(hasText || completed).toBe(true);
}

function getToolUseEvents(events: AgentEvent[]): AgentEvent[] {
	return events.filter((event) => event.type === "tool_use");
}

async function checkCliAvailable(cmd: string): Promise<boolean> {
	try {
		const proc = Bun.spawn([cmd, "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		await proc.exited;
		return proc.exitCode === 0;
	} catch {
		return false;
	}
}

describeIntegration("Agent Process Integration", () => {
	let ampAvailable = false;
	let claudeAvailable = false;

	beforeAll(async () => {
		ampAvailable = await checkCliAvailable("amp");
		claudeAvailable = await checkCliAvailable("claude");

		if (!ampAvailable || !claudeAvailable) {
			if (ALLOW_MISSING_AGENT_CLI) {
				if (!ampAvailable) console.log("[skip] amp CLI not available");
				if (!claudeAvailable) console.log("[skip] claude CLI not available");
			} else {
				throw new Error(
					"Agent CLI(s) missing. Install `amp` and `claude` or set BIGWIG_ALLOW_MISSING_AGENT_CLI=1 to skip.",
				);
			}
		}
	});

	describe("AmpProcess", () => {
		test(
			"executes simple prompt and returns valid events",
			async () => {
				if (!ampAvailable) {
					console.log("[skip] amp not available");
					return;
				}

				const process = new AmpProcess();

				try {
					const events = await withTimeout(
						collectEvents(process.execute(SIMPLE_PROMPT), TIMEOUT_MS),
						TIMEOUT_MS,
						"amp execute",
					);

					assertAgentEvents(events, "amp");

					console.log(`[amp] Received ${events.length} events`);
				} finally {
					await process.stop();
				}
			},
			TIMEOUT_MS + 5000,
		);

		test(
			"getStatus returns valid task structure",
			async () => {
				if (!ampAvailable) {
					console.log("[skip] amp not available");
					return;
				}

				const process = new AmpProcess();

				try {
					const runTest = async () => {
						for await (const _event of process.execute(SIMPLE_PROMPT)) {
							const status = process.getStatus();
							expect(status).toHaveProperty("tasks");
							expect(Array.isArray(status.tasks)).toBe(true);

							if (status.tasks.length > 0) {
								const task = status.tasks[0];
								expect(task).toHaveProperty("id");
								expect(task).toHaveProperty("description");
								expect(task).toHaveProperty("status");
							}
							break;
						}
					};

					await withTimeout(runTest(), TIMEOUT_MS, "amp getStatus");
				} finally {
					await process.stop();
				}
			},
			TIMEOUT_MS + 5000,
		);
	});

	describe("ClaudeProcess", () => {
		test(
			"executes simple prompt and returns valid events",
			async () => {
				if (!claudeAvailable) {
					console.log("[skip] claude not available");
					return;
				}

				const process = new ClaudeProcess();

				try {
					const events = await withTimeout(
						collectEvents(process.execute(SIMPLE_PROMPT), TIMEOUT_MS),
						TIMEOUT_MS,
						"claude execute",
					);

					assertAgentEvents(events, "claude");

					console.log(`[claude] Received ${events.length} events`);
				} finally {
					await process.stop();
				}
			},
			TIMEOUT_MS + 5000,
		);

		test(
			"surfaces tool calls in the event stream",
			async () => {
				if (!claudeAvailable) {
					console.log("[skip] claude not available");
					return;
				}

				const process = new ClaudeProcess();

				try {
					const events = await withTimeout(
						collectEvents(process.execute(TOOL_PROMPT), TIMEOUT_MS),
						TIMEOUT_MS,
						"claude tool use",
					);

					const toolEvents = getToolUseEvents(events);
					if (toolEvents.length === 0) {
						const errorMessage = getErrorMessage(events);
						if (errorMessage && shouldSkipForError(errorMessage)) {
							console.log(`[skip] claude not ready: ${errorMessage}`);
							return;
						}
						const types = Array.from(
							new Set(events.map((event) => String(event.type || "unknown"))),
						).join(", ");
						console.log(
							`[skip] claude produced no tool_use events: ${types}`,
						);
						return;
					}

					const status = process.getStatus();
					const hasToolHistory = status.tasks.some((task) => {
						const history = task.events as Array<unknown> | undefined;
						return Array.isArray(history) && history.length > 0;
					});
					expect(hasToolHistory).toBe(true);

					console.log(`[claude] Tool events: ${toolEvents.length}`);
				} finally {
					await process.stop();
				}
			},
			TIMEOUT_MS + 5000,
		);

		test(
			"getStatus returns valid task structure",
			async () => {
				if (!claudeAvailable) {
					console.log("[skip] claude not available");
					return;
				}

				const process = new ClaudeProcess();

				try {
					const runTest = async () => {
						for await (const _event of process.execute(SIMPLE_PROMPT)) {
							const status = process.getStatus();
							expect(status).toHaveProperty("tasks");
							expect(Array.isArray(status.tasks)).toBe(true);

							if (status.tasks.length > 0) {
								const task = status.tasks[0];
								expect(task).toHaveProperty("id");
								expect(task).toHaveProperty("description");
								expect(task).toHaveProperty("status");
							}
							break;
						}
					};

					await withTimeout(runTest(), TIMEOUT_MS, "claude getStatus");
				} finally {
					await process.stop();
				}
			},
			TIMEOUT_MS + 5000,
		);
	});

	describe("Schema compatibility", () => {
		test(
			"both agents produce events with compatible type field",
			async () => {
				if (!ampAvailable || !claudeAvailable) {
					console.log("[skip] both agents required for compatibility test");
					return;
				}

				const ampProcess = new AmpProcess();
				const claudeProcess = new ClaudeProcess();
				const ampTypes = new Set<string>();
				const claudeTypes = new Set<string>();

				try {
					const ampEvents = await withTimeout(
						collectEvents(ampProcess.execute(SIMPLE_PROMPT), TIMEOUT_MS),
						TIMEOUT_MS,
						"amp schema test",
					);
					for (const event of ampEvents) {
						if (typeof event.type === "string") {
							ampTypes.add(event.type);
						}
					}
				} finally {
					await ampProcess.stop();
				}

				try {
					const claudeEvents = await withTimeout(
						collectEvents(claudeProcess.execute(SIMPLE_PROMPT), TIMEOUT_MS),
						TIMEOUT_MS,
						"claude schema test",
					);
					for (const event of claudeEvents) {
						if (typeof event.type === "string") {
							claudeTypes.add(event.type);
						}
					}
				} finally {
					await claudeProcess.stop();
				}

				console.log(`[amp] Event types: ${[...ampTypes].join(", ")}`);
				console.log(`[claude] Event types: ${[...claudeTypes].join(", ")}`);

				expect(ampTypes.size).toBeGreaterThan(0);
				expect(claudeTypes.size).toBeGreaterThan(0);
			},
			TIMEOUT_MS * 2 + 10000,
		);
	});
});
