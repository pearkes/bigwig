import { askUserTool } from "./ask_user";
import { requestFileTool } from "./request_file";
import { sendHtmlTool } from "./send_html";
import { sendMarkdownTool } from "./send_markdown";

export type ToolHandler = {
	name: string;
	help: string;
	run: (argv: string[]) => Promise<number>;
};

const tools: ToolHandler[] = [
	askUserTool,
	requestFileTool,
	sendMarkdownTool,
	sendHtmlTool,
];

export function getToolDocs(): string {
	return tools
		.map(
			(tool) =>
				`### \`bigwig tool ${tool.name}\`\n\n\`\`\`\n${tool.help}\n\`\`\``,
		)
		.join("\n\n");
}

export function listToolNames(): string[] {
	return tools.map((tool) => tool.name);
}

export function getToolByName(name: string): ToolHandler | undefined {
	return tools.find((tool) => tool.name === name);
}

export async function runToolCli(argv: string[]): Promise<number> {
	const [toolName, ...toolArgs] = argv;

	if (!toolName || toolName === "--help" || toolName === "-h") {
		console.log(`Usage: bigwig tool <name> [args...]

Available tools:
  ${listToolNames().join("\n  ")}

Run "bigwig tool <name> --help" for tool-specific help.`);
		return toolName ? 0 : 1;
	}

	const tool = getToolByName(toolName);
	if (!tool) {
		console.error(`Unknown tool: ${toolName}`);
		console.error(`Available tools: ${listToolNames().join(", ")}`);
		return 1;
	}

	return tool.run(toolArgs);
}
