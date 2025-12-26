/**
 * Human-readable tool labels and context extraction for Amp tools.
 */

const TOOL_LABELS: Record<string, { label: string; verb: string }> = {
	// File operations
	Read: { label: "Reading", verb: "Reading" },
	create_file: { label: "Creating file", verb: "Creating" },
	edit_file: { label: "Editing", verb: "Editing" },
	undo_edit: { label: "Undoing edit", verb: "Undoing" },
	glob: { label: "Finding files", verb: "Finding" },

	// Search
	Grep: { label: "Searching", verb: "Searching" },
	finder: { label: "Searching code", verb: "Searching" },

	// Execution
	Bash: { label: "Running command", verb: "Running" },
	Task: { label: "Running subtask", verb: "Running" },

	// AI tools
	oracle: { label: "Consulting oracle", verb: "Thinking" },
	librarian: { label: "Researching code", verb: "Researching" },

	// Web
	web_search: { label: "Searching web", verb: "Searching" },
	read_web_page: { label: "Reading webpage", verb: "Reading" },

	// Threads
	read_thread: { label: "Reading thread", verb: "Reading" },
	find_thread: { label: "Finding threads", verb: "Finding" },

	// Planning
	todo_read: { label: "Checking tasks", verb: "Checking" },
	todo_write: { label: "Planning", verb: "Planning" },

	// Visual
	mermaid: { label: "Creating diagram", verb: "Drawing" },
	look_at: { label: "Analyzing file", verb: "Analyzing" },

	// MCP
	read_mcp_resource: { label: "Reading resource", verb: "Reading" },
	skill: { label: "Loading skill", verb: "Loading" },
};

function truncate(str: string, max: number): string {
	if (!str) return "";
	return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function formatPath(path?: string): string | null {
	if (!path) return null;
	const parts = path.split("/");
	const filename = parts[parts.length - 1];
	if (parts.length >= 2) {
		const parent = parts[parts.length - 2];
		if (!["src", "lib", "components", "app"].includes(parent)) {
			return `${parent}/${filename}`;
		}
	}
	return filename;
}

function formatCommand(cmd?: string): string | null {
	if (!cmd) return null;
	const clean = cmd.trim().replace(/\s+/g, " ");
	return truncate(clean, 35);
}

function formatUrl(url?: string): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		return u.hostname.replace("www.", "");
	} catch {
		return truncate(url, 25);
	}
}

function extractContext(name: string, input?: string): string | null {
	if (!input) return null;

	try {
		const parsed = JSON.parse(input);

		switch (name) {
			case "Read":
			case "edit_file":
			case "create_file":
			case "undo_edit":
			case "look_at":
				return formatPath(parsed.path);

			case "Bash":
				return formatCommand(parsed.cmd);

			case "Grep":
				return parsed.pattern ? `"${truncate(parsed.pattern, 25)}"` : null;

			case "glob":
				return parsed.filePattern;

			case "finder":
				return truncate(parsed.query, 30);

			case "web_search":
				return truncate(parsed.objective, 30);

			case "read_web_page":
				return formatUrl(parsed.url);

			case "Task":
				return truncate(parsed.description, 30);

			case "read_thread":
			case "find_thread":
				return parsed.threadID
					? `Thread ${parsed.threadID.slice(0, 8)}…`
					: null;

			default:
				return null;
		}
	} catch {
		return truncate(input, 30);
	}
}

export function getToolDisplay(name: string, input?: string): string {
	const known = TOOL_LABELS[name];

	if (known) {
		const context = extractContext(name, input);
		if (context) {
			return `${known.verb} ${context}`;
		}
		return known.label;
	}

	// MCP tools: mcp__server__tool → "server: tool"
	if (name.startsWith("mcp__")) {
		const parts = name.replace("mcp__", "").split("__");
		return parts.join(": ");
	}

	// Unknown tool - return as-is
	return name;
}
