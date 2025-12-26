import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "node:net";

let askUserFromBridge: typeof import("../../../src/worker/agents/ask_user").askUserFromBridge;
let deliverInputResponse: typeof import("../../../src/worker/bridge").deliverInputResponse;
let getPendingRequestCount: typeof import("../../../src/worker/bridge").getPendingRequestCount;
let setEventCallback: typeof import("../../../src/worker/bridge").setEventCallback;
let startBridge: typeof import("../../../src/worker/bridge").startBridge;
let canStartBridge = true;

beforeAll(async () => {
	const probe = createServer();
	await new Promise<void>((resolve) => {
		probe.once("error", () => {
			canStartBridge = false;
			resolve();
		});
		probe.listen(9100, "127.0.0.1", () => {
			probe.close(() => resolve());
		});
	});

	if (!canStartBridge) return;

	const bridgeMod = await import(
		`../../../src/worker/bridge?test=${Date.now()}`
	);
	const askMod = await import(
		`../../../src/worker/agents/ask_user?test=${Date.now()}`
	);
	({
		deliverInputResponse,
		getPendingRequestCount,
		setEventCallback,
		startBridge,
	} = bridgeMod);
	({ askUserFromBridge } = askMod);
	await startBridge();
});

afterEach(() => {
	if (setEventCallback) setEventCallback(null);
});

describe("bridge integration", () => {
	test("askUserFromBridge resolves with input response", async () => {
		if (!canStartBridge) return;
		setEventCallback((event) => {
			if (event.type !== "input_request") return;
			const requestId = String(event.id || "");
			if (!requestId) return;
			void deliverInputResponse(requestId, {
				type: "input_response",
				id: requestId,
				value: "ok",
			});
		});

		const result = await askUserFromBridge("Ping?", { timeout: 5 });
		expect(result).toBe("ok");
		expect(getPendingRequestCount()).toBe(0);
	});
});
