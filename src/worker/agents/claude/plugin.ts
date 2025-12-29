import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { generateClaudeMd, generateClaudeSkills } from "../../sync_tools";
import type { AgentPlugin, CommandOpts, SetupContext } from "../types";
import { ClaudeProcess } from "./process";

export const claudePlugin: AgentPlugin = {
	name: "claude",
	supports: {
		jsonStreaming: true,
		threadResume: true,
		mcp: true,
	},
	embeddedSkills: {
		dir: ".claude/skills",
		filterPrefix: "skills/skill-creator/",
		stripPrefix: "skills/",
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
				await generateClaudeMd(ctx.workspaceDir);
				await generateClaudeSkills(ctx.workspaceDir);
			} catch (err) {
				console.log(`[claude] Failed to generate Claude skills: ${err}`);
			}
		},
	},
	createProcess() {
		return new ClaudeProcess();
	},
	async listSkills(workspaceDir: string): Promise<string[]> {
		const skillsDir = join(workspaceDir, ".claude", "skills");
		try {
			const entries = await readdir(skillsDir, { withFileTypes: true });
			const skillNames: string[] = [];
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const candidate = join(skillsDir, entry.name, "SKILL.md");
				try {
					await access(candidate);
					skillNames.push(entry.name);
				} catch {
					// skip non-skill folders
				}
			}
			return skillNames;
		} catch {
			return [];
		}
	},
};
