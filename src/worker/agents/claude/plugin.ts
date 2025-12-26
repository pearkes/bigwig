import { generateClaudeSkills } from "../../sync_tools";
import type { AgentPlugin, CommandOpts, SetupContext } from "../types";
import { ClaudeProcess } from "./process";

export const claudePlugin: AgentPlugin = {
	name: "claude",
	supports: {
		jsonStreaming: true,
		threadResume: true,
		mcp: true,
	},
	buildCommand(_opts: CommandOpts): string[] {
		return ["claude", "-p"];
	},
	parseEvent(): null {
		return null;
	},
	hooks: {
		async authenticate() {
			return { success: true, method: "skipped" };
		},
		async setup(ctx: SetupContext): Promise<void> {
			try {
				await generateClaudeSkills(ctx.workspaceDir);
			} catch (err) {
				console.log(`[claude] Failed to generate Claude skills: ${err}`);
			}
		},
	},
	createProcess() {
		return new ClaudeProcess();
	},
};
