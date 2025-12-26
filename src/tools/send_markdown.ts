import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { lookup } from "mime-types";
import { send } from "./bridge";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per image
const CHUNK_SIZE = 100 * 1024; // 100KB for base64 chunks
const WORKSPACE_DIR =
	process.env.BIGWIG_WORKSPACE_DIR || resolve(import.meta.dirname, "..");

const HELP_TEXT = `Usage: bigwig tool send_markdown [--title TITLE] MARKDOWN_TEXT
       cat file.md | bigwig tool send_markdown [--title TITLE]

Options:
  --title, -t     Optional title/heading for the message
  --help, -h      Show this help

Images:
  Local images referenced with ![alt](path) syntax are automatically
  embedded and sent to the client. URLs are left as-is.

Examples:
  bigwig tool send_markdown "# Hello\\n\\nSome text here"
  bigwig tool send_markdown --title "Report" "## Results\\n\\n![chart](./chart.png)"
  cat analysis.md | bigwig tool send_markdown --title "Analysis"

Notes:
  - Maximum image size: 10MB each
  - Supported formats: PNG, JPG, GIF, WebP, etc.`;

function validatePath(filePath: string): string {
	const resolved = resolve(filePath);
	const workspaceResolved = resolve(WORKSPACE_DIR);

	if (
		!resolved.startsWith(`${workspaceResolved}/`) &&
		resolved !== workspaceResolved
	) {
		throw new Error(`Security: path "${filePath}" is outside workspace`);
	}
	return resolved;
}

function generateFileId(): string {
	return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function sendFile(
	filePath: string,
	description?: string,
): Promise<string> {
	const safePath = validatePath(filePath);
	const data = await readFile(safePath);

	if (data.length > MAX_FILE_SIZE) {
		throw new Error(
			`File too large: ${data.length} bytes (max ${MAX_FILE_SIZE})`,
		);
	}

	const base64 = data.toString("base64");
	const name = basename(safePath);
	const mime = lookup(safePath) || "application/octet-stream";
	const fileId = generateFileId();

	const chunks: string[] = [];
	for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
		chunks.push(base64.slice(i, i + CHUNK_SIZE));
	}

	await send({
		type: "file_start",
		file_id: fileId,
		name,
		mime,
		size: data.length,
		total_chunks: chunks.length,
		description,
	});

	for (let i = 0; i < chunks.length; i += 1) {
		await send({
			type: "file_chunk",
			file_id: fileId,
			chunk_index: i,
			data: chunks[i],
		});
	}

	console.log(
		`[send_markdown] Embedded file: ${name} (${mime}, ${data.length} bytes)`,
	);
	return fileId;
}

interface ImageRef {
	fullMatch: string;
	altText: string;
	path: string;
}

function findImageReferences(markdown: string): ImageRef[] {
	const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	const refs: ImageRef[] = [];
	let match: RegExpExecArray | null = imageRegex.exec(markdown);

	while (match) {
		const path = match[2];
		if (
			!path.startsWith("http://") &&
			!path.startsWith("https://") &&
			!path.startsWith("data:")
		) {
			refs.push({
				fullMatch: match[0],
				altText: match[1],
				path,
			});
		}
		match = imageRegex.exec(markdown);
	}

	return refs;
}

export const sendMarkdownTool = {
	name: "send_markdown",
	help: HELP_TEXT,
	async run(argv: string[]): Promise<number> {
		const { values, positionals } = parseArgs({
			args: argv,
			options: {
				title: { type: "string", short: "t" },
				help: { type: "boolean", short: "h" },
			},
			allowPositionals: true,
		});

		if (values.help) {
			console.log(HELP_TEXT);
			return 0;
		}

		let markdown: string;

		if (positionals.length > 0) {
			markdown = positionals.join(" ");
		} else if (!process.stdin.isTTY) {
			const chunks: Buffer[] = [];
			for await (const chunk of process.stdin) {
				chunks.push(chunk);
			}
			markdown = Buffer.concat(chunks).toString("utf-8");
		} else {
			console.error(
				"Error: No markdown content provided. Use --help for usage.",
			);
			return 1;
		}

		try {
			const imageRefs = findImageReferences(markdown);
			const fileIdMap = new Map<string, string>();

			for (const ref of imageRefs) {
				try {
					const fileId = await sendFile(ref.path, ref.altText || undefined);
					fileIdMap.set(ref.fullMatch, fileId);
				} catch (err) {
					console.error(
						`[send_markdown] Warning: Could not embed image ${ref.path}: ${err}`,
					);
				}
			}

			let processedMarkdown = markdown;
			for (const [originalRef, fileId] of fileIdMap) {
				processedMarkdown = processedMarkdown.replace(
					originalRef,
					`![](file://${fileId})`,
				);
			}

			await send({
				type: "message",
				text: processedMarkdown,
				title: values.title,
				format: "markdown",
			});

			const imageCount = fileIdMap.size;
			if (imageCount > 0) {
				console.log(`Sent markdown with ${imageCount} embedded image(s)`);
			} else {
				console.log("Sent markdown to client");
			}
			return 0;
		} catch (err) {
			console.error(`Failed to send markdown: ${err}`);
			return 1;
		}
	},
};
