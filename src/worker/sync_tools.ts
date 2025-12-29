import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildAgentsMd } from "../shared/prompts";
import {
	SUPPORTED_AUTOCOMPLETE,
	SUPPORTED_FIELD_TYPES,
	SUPPORTED_FORMATS,
} from "../tools/form-schema";
import { getToolDocs } from "../tools/registry";
import { WORKSPACE_DIR } from "./config";

export async function generateAgentsMd(workspaceDir: string): Promise<void> {
	const toolDocs = getToolDocs();
	const content = buildAgentsMd(toolDocs);
	await Bun.write(join(workspaceDir, "AGENTS.md"), content);
	console.log(`[sync] Generated ${join(workspaceDir, "AGENTS.md")}`);
}

export async function generateClaudeMd(workspaceDir: string): Promise<void> {
	const toolDocs = getToolDocs();
	const content = buildAgentsMd(toolDocs);
	await Bun.write(join(workspaceDir, "CLAUDE.md"), content);
	console.log(`[sync] Generated ${join(workspaceDir, "CLAUDE.md")}`);
}

async function generateToolDocs(workspaceDir: string): Promise<void> {
	const toolsDir = join(workspaceDir, "tools");
	await mkdir(toolsDir, { recursive: true });

	const readme = `# Bigwig Tools

These tools are available to the worker for user interaction. Invoke them via:

  bigwig tool <name> [args...]

Available tools:
${getToolDocs()}

Tip: run \`bigwig tool <name> --help\` for full usage.`;

	const forms = `# Bigwig Form Schema (ask_user --type form)

Forms are JSON objects with this shape:

{
  "id": "contact",
  "title": "Contact Info",
  "fields": [
    { "id": "name", "label": "Full Name", "type": "string", "required": true }
  ]
}

Supported field types:
${SUPPORTED_FIELD_TYPES.map((type) => `- ${type}`).join("\n")}

Supported formats (string fields only):
${SUPPORTED_FORMATS.map((fmt) => `- ${fmt}`).join("\n")}

Supported autocomplete hints:
${SUPPORTED_AUTOCOMPLETE.map((hint) => `- ${hint}`).join("\n")}

Notes:
- Unsupported field types are downgraded to "string".
- Unknown formats/autocomplete hints are ignored.
- For select/multiselect, include an "options" array of { value, label }.
`;

	await Bun.write(join(toolsDir, "README.md"), readme);
	await Bun.write(join(toolsDir, "FORMS.md"), forms);
	console.log(`[sync] Generated ${join(toolsDir, "README.md")}`);
	console.log(`[sync] Generated ${join(toolsDir, "FORMS.md")}`);
}

export async function generateClaudeSkills(
	workspaceDir: string,
): Promise<void> {
	const skillDir = join(workspaceDir, ".claude", "skills", "bigwig-tools");
	await mkdir(skillDir, { recursive: true });

	const skill = `---
name: bigwig-tools
description: Use Bigwig UI tools to show results, ask questions, or request files. Use when you need to send markdown or HTML, ask the user for input, or request a file during a task.
---

# Bigwig Tools

Use these CLI helpers to communicate with the Bigwig user interface.

---

## send_markdown

\`\`\`
Usage: bigwig tool send_markdown [--title TITLE] MARKDOWN_TEXT
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
  - Supported formats: PNG, JPG, GIF, WebP, etc.
\`\`\`

---

## send_html

\`\`\`
Usage: bigwig tool send_html [OPTIONS] HTML_CONTENT
       cat file.html | bigwig tool send_html [OPTIONS]

Options:
  --title, -t     Optional title/heading for the card
  --width, -w     Width in pixels (default: 350)
  --height, -h    Height in pixels (default: 400)
  --help          Show this help

Examples:
  bigwig tool send_html "<h1>Hello</h1><p>Some content</p>"
  bigwig tool send_html --title "Chart" "<div id='chart'>...</div>"
  bigwig tool send_html --width 300 --height 500 "<table>...</table>"
  cat report.html | bigwig tool send_html --title "Report"

Notes:
  - Content is rendered in a WebView on the client
  - Default size (350x400) fits content cards
  - Inline styles and scripts are supported
  - External resources may not load (use inline/base64)
\`\`\`

---

## ask_user

\`\`\`
Usage: bigwig tool ask_user [OPTIONS] [PROMPT]

Options:
  --type, -t          Input type: text, select, confirm, form (default: text)
  --options, -o       For select type, the choices (can repeat)
  --default, -d       Default/pre-filled value
  --schema, -s        For form type, inline JSON schema
  --schema-file, -f   For form type, path to JSON schema file
  --timeout, -T       Timeout in seconds (default: 120)
  --help, -h          Show this help

Simple Input Examples:
  bigwig tool ask_user "What date works for you?"
  bigwig tool ask_user --type select -o "v1.0" -o "v2.0" -o "v3.0" "Which version?"
  bigwig tool ask_user --type confirm "Delete this file?"

Form Examples:
  bigwig tool ask_user --type form --schema '{"id":"contact","title":"Contact Info","fields":[
    {"id":"name","label":"Full Name","type":"string","required":true,"autocomplete":"name"},
    {"id":"email","label":"Email","type":"email","required":true,"autocomplete":"email"},
    {"id":"phone","label":"Phone","type":"phone","autocomplete":"tel"}
  ]}'

  bigwig tool ask_user --type form --schema-file ./forms/shipping-address.json

Form Field Types:
  string, textarea, password  - Text inputs
  number                      - Numeric input with min/max/step
  boolean                     - Toggle/checkbox
  select, multiselect         - Dropdown with options
  date, time, datetime        - Date/time pickers
  phone, email, url           - Formatted inputs with validation
  credit-card                 - Card number, expiry, CVC (composite)

Autocomplete Hints (for autofill/1Password):
  name, given-name, family-name, email, tel, street-address,
  city, region, postal-code, country, cc-name, cc-number,
  cc-exp, cc-csc, username, current-password, new-password

Output:
  For simple inputs: prints the user's response to stdout.
  For forms: prints JSON object with field values.
  Exit code 0 on success, 1 on cancel/timeout.
\`\`\`

---

## request_file

\`\`\`
Usage: bigwig tool request_file [OPTIONS] PROMPT

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
  Exit code 0 on success, 1 on cancel/timeout.
\`\`\`

---

## Form Schema Reference

Forms are JSON objects with this shape:

\`\`\`json
{
  "id": "contact",
  "title": "Contact Info",
  "description": "Optional description",
  "submitLabel": "Submit",
  "cancelLabel": "Cancel",
  "fields": [
    { "id": "name", "label": "Full Name", "type": "string", "required": true }
  ]
}
\`\`\`

### Supported Field Types
- string, textarea, password
- number
- boolean
- select, multiselect
- date, time, datetime
- phone, email, url
- credit-card

### Supported Formats (string fields only)
- email, uri, phone, postal-code, country, currency

### Supported Autocomplete Hints
- name, given-name, family-name, honorific-prefix
- email, tel, url
- street-address, address-line1, address-line2, city, region, postal-code, country, country-name
- cc-name, cc-number, cc-exp, cc-exp-month, cc-exp-year, cc-csc, cc-type
- username, current-password, new-password, one-time-code

### Field Options

All fields support:
- \`id\` (required) - Unique field identifier
- \`label\` (required) - Display label
- \`type\` (required) - Field type
- \`required\` - Whether field is required
- \`placeholder\` - Placeholder text
- \`helpText\` - Help text below field
- \`defaultValue\` - Default value
- \`autocomplete\` - Autofill hint
- \`showIf\` - Conditional display: \`{"fieldId": "country", "equals": "US"}\`
- \`ui\` - Layout options: \`{"width": "half", "section": "Billing", "order": 1}\`

Type-specific options:
- **string/textarea/password**: \`minLength\`, \`maxLength\`, \`pattern\`, \`format\`
- **number**: \`minimum\`, \`maximum\`, \`step\`
- **select/multiselect**: \`options\` array of \`{value, label}\`
- **date/time/datetime**: \`minDate\`, \`maxDate\`
- **credit-card**: \`collectName\`
`;

	await Bun.write(join(skillDir, "SKILL.md"), skill);
	console.log(`[sync] Generated ${join(skillDir, "SKILL.md")}`);
}

export async function syncTools(targetDir: string): Promise<void> {
	await generateToolDocs(targetDir);
}

export async function initWorkspace(): Promise<void> {
	const skipSync = (
		process.env.BIGWIG_SKIP_SYNC ||
		Bun.env.BIGWIG_SKIP_SYNC ||
		""
	).toLowerCase();
	if (skipSync === "true" || skipSync === "1") {
		console.log("[worker] Workspace sync skipped (BIGWIG_SKIP_SYNC=true)");
		return;
	}
	console.log("[worker] Syncing workspace tools...");
	try {
		await syncTools(WORKSPACE_DIR);
		console.log("[worker] Workspace sync complete");
	} catch (err) {
		console.log(`[worker] Workspace sync failed: ${err}`);
	}
}
