import { ampPlugin } from "./amp/plugin";
import { claudePlugin } from "./claude/plugin";
import type { AgentPlugin } from "./types";

const registry = new Map<string, AgentPlugin>();

export function registerAgent(plugin: AgentPlugin): void {
	registry.set(plugin.name, plugin);
}

export function getAgent(name: string): AgentPlugin {
	const plugin = registry.get(name);
	if (!plugin) {
		throw new Error(`Unknown agent plugin: ${name}`);
	}
	return plugin;
}

export function listAgents(): string[] {
	return Array.from(registry.keys());
}

registerAgent(ampPlugin);
registerAgent(claudePlugin);
