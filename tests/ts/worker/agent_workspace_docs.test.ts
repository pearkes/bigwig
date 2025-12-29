import { describe, expect, test } from "bun:test";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ampPlugin } from "../../../src/worker/agents/amp/plugin";
import { claudePlugin } from "../../../src/worker/agents/claude/plugin";
import { syncTools } from "../../../src/worker/sync_tools";

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

	test("claude setup generates CLAUDE.md only", async () => {
		const workspaceDir = await mkdtemp(join(tmpdir(), "bigwig-claude-"));
		try {
			const skillsDir = join(workspaceDir, "skills");
			await mkdir(skillsDir, { recursive: true });
			await claudePlugin.hooks?.setup?.({
				workspaceDir,
				skillsDir,
				toolDocs: "",
			});
			expect(await pathExists(join(workspaceDir, "CLAUDE.md"))).toBe(true);
			expect(await pathExists(join(workspaceDir, "AGENTS.md"))).toBe(false);
		} finally {
			await rm(workspaceDir, { recursive: true, force: true });
		}
	});

	test("amp setup generates AGENTS.md only", async () => {
		const workspaceDir = await mkdtemp(join(tmpdir(), "bigwig-amp-"));
		const binDir = join(workspaceDir, "bin");
		const prevPath = process.env.PATH;
		try {
			await mkdir(binDir, { recursive: true });
			const ampPath = join(binDir, "amp");
			await writeFile(ampPath, "#!/bin/sh\nexit 0\n");
			await chmod(ampPath, 0o755);
			process.env.PATH = `${binDir}${prevPath ? `:${prevPath}` : ""}`;

			const skillsDir = join(workspaceDir, "skills");
			await mkdir(skillsDir, { recursive: true });
			await ampPlugin.hooks?.setup?.({
				workspaceDir,
				skillsDir,
				toolDocs: "",
			});
			expect(await pathExists(join(workspaceDir, "AGENTS.md"))).toBe(true);
			expect(await pathExists(join(workspaceDir, "CLAUDE.md"))).toBe(false);
		} finally {
			process.env.PATH = prevPath;
			await rm(workspaceDir, { recursive: true, force: true });
		}
	});
});
