import { parseArgs } from "node:util";
import { sendAndWait } from "./bridge";

const HELP_TEXT = `Usage: bigwig tool request_file [OPTIONS] PROMPT

Options:
  --type, -t          Request type: any, image, document, photo (default: any)
  --camera, -c        Prompt user to take a photo (opens camera directly)
  --required, -r      File is required (don't allow skip)
  --timeout, -T       Timeout in seconds (default: 120)
  --help, -h          Show this help

Examples:
  bigwig tool request_file "Please upload the document you'd like me to review"
  bigwig tool request_file --type image "Show me what you're looking at"
  bigwig tool request_file --camera "Take a photo of the error message"
  bigwig tool request_file --type document --required "Upload your receipt"

File Types:
  any       - All supported files (images, PDFs, text)
  image     - Images only (PNG, JPEG, HEIC, WebP, GIF)
  document  - Documents only (PDF, text files)
  photo     - Camera capture only (opens camera)

Output:
  Prints the path to the received file on stdout.
  Exit code 0 on success, 1 on cancel/timeout.`;

interface FileResponse {
	type: "file_response";
	id: string;
	file_path?: string;
	original_name?: string;
	mime_type?: string;
	size?: number;
	cancelled?: boolean;
	reason?: string;
}

export const requestFileTool = {
	name: "request_file",
	help: HELP_TEXT,
	async run(argv: string[]): Promise<number> {
		const { values, positionals } = parseArgs({
			args: argv,
			options: {
				type: { type: "string", short: "t", default: "any" },
				camera: { type: "boolean", short: "c" },
				required: { type: "boolean", short: "r" },
				timeout: { type: "string", short: "T", default: "120" },
				help: { type: "boolean", short: "h" },
			},
			allowPositionals: true,
		});

		if (values.help) {
			console.log(HELP_TEXT);
			return 0;
		}

		const prompt = positionals.join(" ").trim();
		if (!prompt) {
			console.error("Error: prompt is required");
			return 1;
		}

		const fileType = values.type as "any" | "image" | "document" | "photo";
		const validTypes = ["any", "image", "document", "photo"];
		if (!validTypes.includes(fileType)) {
			console.error(
				`Error: invalid type "${fileType}". Must be one of: ${validTypes.join(", ")}`,
			);
			return 1;
		}

		const timeoutSeconds = parseInt(values.timeout || "120", 10);
		if (Number.isNaN(timeoutSeconds) || timeoutSeconds <= 0) {
			console.error("Error: --timeout must be a positive integer");
			return 1;
		}

		try {
			const response = await sendAndWait<FileResponse>(
				{
					type: "file_request",
					prompt,
					file_type: fileType,
					open_camera: values.camera || fileType === "photo",
					required: values.required,
					timeout_seconds: timeoutSeconds,
				},
				timeoutSeconds * 1000 + 5000,
			);

			if (response.cancelled) {
				console.error(
					`File request cancelled: ${response.reason || "user cancelled"}`,
				);
				return 1;
			}

			if (!response.file_path) {
				console.error("Error: no file path in response");
				return 1;
			}

			console.log(response.file_path);
			return 0;
		} catch (err) {
			console.error(`Failed to get file: ${err}`);
			return 1;
		}
	},
};
