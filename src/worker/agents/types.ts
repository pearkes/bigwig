import type { AgentEvent, TaskRecord } from "../../shared/tasks";

export interface CommandOpts {
	resume?: string;
	dangerouslyAllowAll?: boolean;
}

export interface AuthContext {
	workspaceDir: string;
	askUser?: (prompt: string, opts?: AskUserOpts) => Promise<string>;
	hasEnvVar: (name: string) => boolean;
}

export interface AskUserOpts {
	type?: "text" | "select" | "confirm";
	options?: string[];
	timeout?: number;
}

export interface AuthResult {
	success: boolean;
	method?: "env" | "oauth" | "token" | "skipped";
	error?: string;
}

export interface SetupContext {
	workspaceDir: string;
	skillsDir: string;
	toolDocs: string;
}

export interface TaskContext {
	workspaceDir: string;
	taskId: string;
}

export interface AgentProcess {
	pid: number | null;
	isRunning: boolean;
	isBusy: boolean;
	isIdleExpired: boolean;
	idleSeconds: number;
	thread_id: string | null;
	currentTaskIdValue: string | null;

	getStatus(): { tasks: Array<Record<string, unknown>> };
	getLastTaskDescription(): string | null;
	getTask(taskId: string): TaskRecord | undefined;
	updateTask(message: string, title?: string): Promise<string>;
	cancel(): Promise<string>;
	ensureRunning(resumeThreadId?: string | null): Promise<void>;
	stop(): Promise<void>;
	execute(
		taskDesc: string,
		resumeThreadId?: string | null,
	): AsyncGenerator<Record<string, unknown>>;
}

export interface AgentPluginHooks {
	authenticate?: (ctx: AuthContext) => Promise<AuthResult>;
	setup?: (ctx: SetupContext) => Promise<void>;
	afterTask?: (ctx: TaskContext) => Promise<void>;
}

export interface RecentSession {
	title: string;
	relative_time: string;
	session_id: string;
}

export interface AgentPlugin {
	name: string;
	supports: {
		jsonStreaming: boolean;
		threadResume: boolean;
		mcp: boolean;
	};
	embeddedSkills?: {
		dir: string;
		filterPrefix?: string;
		stripPrefix?: string;
	};
	buildCommand: (opts: CommandOpts) => string[];
	parseEvent: (line: string) => AgentEvent | null;
	hooks: AgentPluginHooks;
	createProcess: () => AgentProcess;
	listSkills?: (workspaceDir: string) => Promise<string[]>;
	getSessions?: (limit?: number) => Promise<RecentSession[]>;
}
