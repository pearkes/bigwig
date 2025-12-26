import { getEnv } from "../../shared/env";
import { AgentPool } from "./pool";
import { getAgent } from "./registry";
import type { AgentPlugin } from "./types";

let pool: AgentPool | null = null;

export function getAgentName(): string {
	return getEnv("BIGWIG_AGENT", "amp");
}

export function getAgentPlugin(): AgentPlugin {
	return getAgent(getAgentName());
}

export function getAgentPool(): AgentPool {
	if (!pool) {
		pool = new AgentPool(getAgentPlugin());
	}
	return pool;
}
