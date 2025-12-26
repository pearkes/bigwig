import { describe, expect, test } from "bun:test";
import { getAgentName } from "../../../src/worker/agents/manager";

describe("agent manager", () => {
	test("defaults to amp", () => {
		delete process.env.BIGWIG_AGENT;
		expect(getAgentName()).toBe("amp");
	});

	test("uses BIGWIG_AGENT env", () => {
		process.env.BIGWIG_AGENT = "custom";
		expect(getAgentName()).toBe("custom");
		delete process.env.BIGWIG_AGENT;
	});
});
