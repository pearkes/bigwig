import type {
	AgentPlugin,
	AuthContext,
	AuthResult,
	CommandOpts,
	RecentSession,
	SetupContext,
	TaskContext,
} from "../types";
import { runCommand } from "./command";
import { AmpProcess } from "./process";

export const ampPlugin: AgentPlugin = {
	name: "amp",
	supports: {
		jsonStreaming: true,
		threadResume: true,
		mcp: true,
	},
	buildCommand({ resume, dangerouslyAllowAll = true }: CommandOpts) {
		const base = ["amp", "-x", "--stream-json", "--stream-json-input"];
		if (dangerouslyAllowAll) base.push("--dangerously-allow-all");
		if (resume) return ["amp", "threads", "continue", resume, ...base.slice(1)];
		return base;
	},
	parseEvent(line: string) {
		try {
			JSON.parse(line);
		} catch {
			return null;
		}
		return null;
	},
	hooks: {
		async authenticate(ctx: AuthContext): Promise<AuthResult> {
			if (process.env.BIGWIG_ENABLE_AMP_AUTH !== "1") {
				return { success: true, method: "skip" };
			}

			const version = await runCommand(["amp", "--version"], ctx.workspaceDir);
			if (!version.ok) {
				return { success: false, error: "amp CLI not found" };
			}

			const whoami = await runCommand(["amp", "whoami"], ctx.workspaceDir);
			if (whoami.ok) {
				return { success: true, method: "env" };
			}

			if (!ctx.askUser) {
				return {
					success: false,
					error: "amp not authenticated and no prompt available",
				};
			}

			const token = await ctx.askUser(
				"Enter your Amp API token (from ampcode.com/settings):",
				{
					type: "text",
					timeout: 300,
				},
			);

			if (!token) {
				return { success: false, error: "No token provided" };
			}

			const login = await runCommand(
				["amp", "auth", "login", "--token", token],
				ctx.workspaceDir,
			);
			return login.ok
				? { success: true, method: "token" }
				: { success: false, error: login.stderr };
		},
		async setup(ctx: SetupContext): Promise<void> {
			const result = await runCommand(
				["amp", "skill", "add", ctx.skillsDir],
				ctx.workspaceDir,
			);
			if (result.ok) {
				console.log("[sync] Added skills with amp skill add");
			} else if (result.stderr.includes("ENOENT")) {
				console.log("[sync] amp not found, skipping skill add");
			} else if (result.stderr.trim()) {
				console.log(`[sync] Failed to add skills: ${result.stderr}`);
			}
		},
		async afterTask(ctx: TaskContext): Promise<void> {
			const result = await runCommand(
				["amp", "skill", "add", "./skills"],
				ctx.workspaceDir,
			);
			if (result.ok) {
				console.log("[amp] Skills synced");
			} else if (result.stderr.trim()) {
				console.log(`[amp] Skills sync failed: ${result.stderr.trim()}`);
			}
		},
	},
	createProcess() {
		return new AmpProcess();
	},
	async listSkills(workspaceDir: string): Promise<string[]> {
		const result = await runCommand(["amp", "skills", "list"], workspaceDir);
		if (!result.ok) return [];
		return result.stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
	},
	async getSessions(limit = 10): Promise<RecentSession[]> {
		const result = await runCommand(["amp", "threads"], process.cwd());
		if (!result.ok) return [];

		const lines = result.stdout.split("\n");
		const sessions: RecentSession[] = [];

		for (const line of lines) {
			if (line.startsWith("─") || line.startsWith("Title")) continue;
			if (!line.trim()) continue;

			const match = line.match(
				/^(.+?)\s{2,}(\S+\s+ago)\s{2,}\S+\s{2,}\d+\s{2,}(T-\S+)$/,
			);
			if (match) {
				sessions.push({
					title: match[1].trim(),
					relative_time: match[2],
					session_id: match[3],
				});
			}

			if (sessions.length >= limit) break;
		}

		return sessions;
	},
};
