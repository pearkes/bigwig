import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("worker upload pipeline", () => {
	let root = "";
	let workerMod: typeof import("../../../src/worker/index");
	let configMod: typeof import("../../../src/worker/config");

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "bigwig-worker-"));
		process.env.WORKSPACE_DIR = root;
		try {
			(Bun.env as Record<string, string>).WORKSPACE_DIR = root;
		} catch {}
		const stamp = Date.now();
		workerMod = await import(`../../../src/worker/index?test=${stamp}`);
		configMod = await import(`../../../src/worker/config?test=${stamp}`);
	});

	afterAll(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	test("sanitizeFilename strips unsafe characters", async () => {
		const { sanitizeFilename } = workerMod.__test__;

		const value = sanitizeFilename("../etc/passwd");
		expect(value.includes("/")).toBe(false);
		expect(value.includes("\\")).toBe(false);
		expect(value.startsWith(".")).toBe(false);
	});

	test("finalizeUpload writes file and clears pending", async () => {
		const { pendingUploads, finalizeUpload } = workerMod.__test__;

		const fileId = "file-1";
		const requestId = "req-1";
		const base64 = Buffer.from("hello").toString("base64");

		const pending = {
			request_id: requestId,
			name: "hello.txt",
			mime: "text/plain",
			size: 5,
			total_chunks: 1,
			chunks: new Map([[0, base64]]),
			started_at: Date.now() / 1000,
		};

		pendingUploads.set(fileId, pending);
		await finalizeUpload(fileId, pending);

		const filePath = join(configMod.UPLOADS_DIR, requestId, "hello.txt");
		const contents = await readFile(filePath, "utf8");
		expect(contents).toBe("hello");
		expect(pendingUploads.has(fileId)).toBe(false);
	});

	test("cleanupStaleUploads removes old entries", async () => {
		const { pendingUploads, cleanupStaleUploads } = workerMod.__test__;

		const fileId = "stale";
		pendingUploads.set(fileId, {
			request_id: "req-stale",
			name: "old.txt",
			mime: "text/plain",
			size: 0,
			total_chunks: 1,
			chunks: new Map(),
			started_at: Date.now() / 1000 - configMod.UPLOAD_TIMEOUT_SECONDS - 10,
		});

		cleanupStaleUploads();
		expect(pendingUploads.has(fileId)).toBe(false);
	});
});
