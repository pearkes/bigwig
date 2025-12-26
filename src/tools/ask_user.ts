import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { sendAndWait } from "./bridge";
import {
	createSchemaErrorResponse,
	validateFormSchema,
} from "./form-validator";

const HELP_TEXT = `Usage: bigwig tool ask_user [OPTIONS] [PROMPT]

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
  Exit code 0 on success, 1 on cancel/timeout.`;

interface InputResponse {
	type: "input_response";
	id: string;
	value?: string;
	cancelled?: boolean;
	reason?: string;
}

export const askUserTool = {
	name: "ask_user",
	help: HELP_TEXT,
	async run(argv: string[]): Promise<number> {
		const { values, positionals } = parseArgs({
			args: argv,
			options: {
				type: { type: "string", short: "t", default: "text" },
				options: { type: "string", short: "o", multiple: true },
				default: { type: "string", short: "d" },
				timeout: { type: "string", short: "T", default: "120" },
				schema: { type: "string", short: "s" },
				"schema-file": { type: "string", short: "f" },
				help: { type: "boolean", short: "h" },
			},
			allowPositionals: true,
		});

		if (values.help) {
			console.log(HELP_TEXT);
			return 0;
		}

		const prompt = positionals.join(" ");
		const inputType = values.type as "text" | "select" | "confirm" | "form";
		const timeoutSeconds = parseInt(values.timeout || "120", 10);

		if (
			inputType === "select" &&
			(!values.options || values.options.length === 0)
		) {
			console.error("Error: --type select requires at least one --options");
			return 1;
		}

		if (inputType === "form") {
			let schemaInput: unknown;

			if (values["schema-file"]) {
				try {
					const content = readFileSync(values["schema-file"], "utf-8");
					schemaInput = JSON.parse(content);
				} catch (err) {
					console.error(`Error reading schema file: ${err}`);
					return 1;
				}
			} else if (values.schema) {
				try {
					schemaInput = JSON.parse(values.schema);
				} catch (err) {
					console.error(`Error parsing schema JSON: ${err}`);
					return 1;
				}
			} else {
				console.error("Error: --type form requires --schema or --schema-file");
				return 1;
			}

			const validation = validateFormSchema(schemaInput);

			if (!validation.valid) {
				console.error("Form schema validation failed:");
				for (const error of validation.errors) {
					console.error(`  - ${error}`);
				}
				console.error(
					`\n${JSON.stringify(createSchemaErrorResponse(validation))}`,
				);
				return 1;
			}

			for (const warning of validation.warnings) {
				console.error(`[warn] ${warning}`);
			}

			try {
				const response = await sendAndWait<InputResponse>(
					{
						type: "form_request",
						prompt,
						form: validation.normalized,
						timeout_seconds: timeoutSeconds,
					},
					timeoutSeconds * 1000 + 5000,
				);

				if (response.cancelled) {
					console.error(
						`Form cancelled: ${response.reason || "user cancelled"}`,
					);
					return 1;
				}

				console.log(response.value || "{}");
				return 0;
			} catch (err) {
				console.error(`Failed to get form input: ${err}`);
				return 1;
			}
		}

		if (!prompt) {
			console.error("Error: prompt is required for simple input types");
			return 1;
		}

		try {
			const response = await sendAndWait<InputResponse>(
				{
					type: "input_request",
					prompt,
					input_type: inputType,
					options: values.options,
					default: values.default,
					timeout_seconds: timeoutSeconds,
				},
				timeoutSeconds * 1000 + 5000,
			);

			if (response.cancelled) {
				console.error(
					`Input cancelled: ${response.reason || "user cancelled"}`,
				);
				return 1;
			}

			console.log(response.value || "");
			return 0;
		} catch (err) {
			console.error(`Failed to get user input: ${err}`);
			return 1;
		}
	},
};
