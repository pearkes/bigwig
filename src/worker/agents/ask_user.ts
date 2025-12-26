import { BRIDGE_PORT } from "../config";
import type { AskUserOpts } from "./types";

type InputResponse = {
	type: "input_response";
	id: string;
	value?: string;
	cancelled?: boolean;
	reason?: string;
};

type InputRequest = {
	type: "input_request";
	id: string;
	prompt: string;
	input_type?: "text" | "select" | "confirm";
	options?: string[];
	timeout_seconds?: number;
};

function generateId(): string {
	return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseMessageData(data: unknown): string {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
	if (ArrayBuffer.isView(data))
		return Buffer.from(data.buffer).toString("utf8");
	return String(data ?? "");
}

export async function askUserFromBridge(
	prompt: string,
	opts: AskUserOpts = {},
): Promise<string> {
	const id = generateId();
	const timeoutSeconds = opts.timeout ?? 120;
	const request: InputRequest = {
		type: "input_request",
		id,
		prompt,
		input_type: opts.type || "text",
		options: opts.options,
		timeout_seconds: timeoutSeconds,
	};

	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}`);
		let resolved = false;

		const cleanup = () => {
			if (!resolved) {
				resolved = true;
				ws.close();
			}
		};

		const timeout = setTimeout(
			() => {
				cleanup();
				reject(new Error("Timeout waiting for response"));
			},
			timeoutSeconds * 1000 + 5000,
		);

		ws.addEventListener("open", () => {
			ws.send(JSON.stringify(request));
		});

		ws.addEventListener("message", (event) => {
			try {
				const response = JSON.parse(
					parseMessageData((event as MessageEvent).data),
				) as InputResponse;
				if (response.id !== id) return;
				clearTimeout(timeout);
				cleanup();
				if (response.cancelled) {
					reject(new Error(response.reason || "user cancelled"));
					return;
				}
				resolve(response.value || "");
			} catch (err) {
				clearTimeout(timeout);
				cleanup();
				reject(new Error(`Invalid response: ${err}`));
			}
		});

		ws.addEventListener("error", (event) => {
			clearTimeout(timeout);
			cleanup();
			const message =
				typeof (event as { message?: unknown }).message === "string"
					? (event as { message: string }).message
					: String(event);
			reject(new Error(`Bridge connection failed: ${message}`));
		});

		ws.addEventListener("close", () => {
			clearTimeout(timeout);
			if (!resolved) {
				resolved = true;
				reject(new Error("Bridge connection closed before response"));
			}
		});
	});
}
