import { describe, expect, test } from "bun:test";
import { getAgent, listAgents } from "../../../src/worker/agents/registry";

describe("agent registry", () => {
	test("lists default agent", () => {
		const agents = listAgents();
		expect(agents).toContain("amp");
		expect(agents).toContain("claude");
	});

	test("unknown agent throws", () => {
		expect(() => getAgent("missing-agent")).toThrow("Unknown agent plugin");
	});
});
