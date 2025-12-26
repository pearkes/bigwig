import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "../../../src/shared/tasks";
import {
	addAgentEventListener,
	emitAgentEvent,
} from "../../../src/worker/agents/events";

describe("agent events", () => {
	test("listeners receive events and can be removed", () => {
		let calls = 0;
		const off = addAgentEventListener(() => {
			calls += 1;
		});

		emitAgentEvent({ type: "message", text: "hi" } as AgentEvent);
		off();
		emitAgentEvent({ type: "message", text: "bye" } as AgentEvent);

		expect(calls).toBe(1);
	});
});
