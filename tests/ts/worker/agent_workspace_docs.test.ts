import { describe, expect, test } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAgentDocs, syncTools } from "../../../src/worker/sync_tools";

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

describe("agent workspace docs", () => {
	test("syncTools does not generate agent docs by default", async () => {
		const workspaceDir = await mkdtemp(join(tmpdir(), "bigwig-docs-"));
		try {
			await syncTools(workspaceDir);
			expect(await pathExists(join(workspaceDir, "AGENTS.md"))).toBe(false);
			expect(await pathExists(join(workspaceDir, "CLAUDE.md"))).toBe(false);
		} finally {
			await rm(workspaceDir, { recursive: true, force: true });
		}
	});

	test("generateAgentDocs creates CLAUDE.md only for claude", async () => {
		const workspaceDir = await mkdtemp(join(tmpdir(), "bigwig-claude-"));
		try {
			await generateAgentDocs(workspaceDir, "claude");
			expect(await pathExists(join(workspaceDir, "CLAUDE.md"))).toBe(true);
			expect(await pathExists(join(workspaceDir, "AGENTS.md"))).toBe(false);
		} finally {
			await rm(workspaceDir, { recursive: true, force: true });
		}
	});

	test("generateAgentDocs creates AGENTS.md only for amp", async () => {
		const workspaceDir = await mkdtemp(join(tmpdir(), "bigwig-amp-"));
		try {
			await generateAgentDocs(workspaceDir, "amp");
			expect(await pathExists(join(workspaceDir, "AGENTS.md"))).toBe(true);
			expect(await pathExists(join(workspaceDir, "CLAUDE.md"))).toBe(false);
		} finally {
			await rm(workspaceDir, { recursive: true, force: true });
		}
	});

	test("generateAgentDocs is default-off for unknown agents", async () => {
		const workspaceDir = await mkdtemp(join(tmpdir(), "bigwig-other-"));
		try {
			await generateAgentDocs(workspaceDir, "other");
			expect(await pathExists(join(workspaceDir, "AGENTS.md"))).toBe(false);
			expect(await pathExists(join(workspaceDir, "CLAUDE.md"))).toBe(false);
		} finally {
			await rm(workspaceDir, { recursive: true, force: true });
		}
	});
});
