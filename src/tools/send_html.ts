import { parseArgs } from "node:util";
import { send } from "./bridge";

const DEFAULT_WIDTH = 350;
const DEFAULT_HEIGHT = 400;

const HELP_TEXT = `Usage: bigwig tool send_html [OPTIONS] HTML_CONTENT
       cat file.html | bigwig tool send_html [OPTIONS]

Options:
  --title, -t     Optional title/heading for the card
  --width, -w     Width in pixels (default: ${DEFAULT_WIDTH})
  --height, -h    Height in pixels (default: ${DEFAULT_HEIGHT})
  --help          Show this help

Examples:
  bigwig tool send_html "<h1>Hello</h1><p>Some content</p>"
  bigwig tool send_html --title "Chart" "<div id='chart'>...</div>"
  bigwig tool send_html --width 300 --height 500 "<table>...</table>"
  cat report.html | bigwig tool send_html --title "Report"

Notes:
  - Content is rendered in a WebView on the client
  - Default size (${DEFAULT_WIDTH}x${DEFAULT_HEIGHT}) fits content cards
  - Inline styles and scripts are supported
  - External resources may not load (use inline/base64)`;

export const sendHtmlTool = {
	name: "send_html",
	help: HELP_TEXT,
	async run(argv: string[]): Promise<number> {
		const { values, positionals } = parseArgs({
			args: argv,
			options: {
				title: { type: "string", short: "t" },
				width: { type: "string", short: "w" },
				height: { type: "string", short: "h" },
				help: { type: "boolean" },
			},
			allowPositionals: true,
		});

		if (values.help) {
			console.log(HELP_TEXT);
			return 0;
		}

		let html: string;

		if (positionals.length > 0) {
			html = positionals.join(" ");
		} else if (!process.stdin.isTTY) {
			const chunks: Buffer[] = [];
			for await (const chunk of process.stdin) {
				chunks.push(chunk);
			}
			html = Buffer.concat(chunks).toString("utf-8");
		} else {
			console.error("Error: No HTML content provided. Use --help for usage.");
			return 1;
		}

		const width = values.width ? parseInt(values.width, 10) : DEFAULT_WIDTH;
		const height = values.height ? parseInt(values.height, 10) : DEFAULT_HEIGHT;

		if (
			Number.isNaN(width) ||
			Number.isNaN(height) ||
			width <= 0 ||
			height <= 0
		) {
			console.error(
				"Error: Invalid width or height. Must be positive integers.",
			);
			return 1;
		}

		const trimmed = html.trim().toLowerCase();
		if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
			console.error("Error: Pass HTML content only, not a full document.");
			return 1;
		}

		const finalHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { 
      width: 100%; 
      height: 100%; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      background: transparent;
    }
  </style>
</head>
<body>${html}</body>
</html>`;

		try {
			await send({
				type: "message",
				text: finalHtml,
				title: values.title,
				format: "html",
				width,
				height,
			});
			console.log(`Sent HTML to client (${width}x${height})`);
			return 0;
		} catch (err) {
			console.error(`Failed to send HTML: ${err}`);
			return 1;
		}
	},
};
