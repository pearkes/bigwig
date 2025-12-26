import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export function repoRoot(): string {
	const envRoot = process.env.BIGWIG_REPO_ROOT ?? Bun.env.BIGWIG_REPO_ROOT;
	const cwdRoot = process.cwd();
	const moduleRoot = resolve(import.meta.dir, "..", "..");

	const candidates = [envRoot, cwdRoot, moduleRoot].filter(Boolean) as string[];
	for (const root of candidates) {
		if (existsSync(join(root, "web")) || existsSync(join(root, "src"))) {
			return root;
		}
	}

	return cwdRoot;
}

export function webCredentialsPath(): string {
	const override =
		process.env.BIGWIG_CREDENTIALS_PATH ?? Bun.env.BIGWIG_CREDENTIALS_PATH;
	if (override) {
		return resolve(override);
	}
	return resolve(repoRoot(), "web", "data", "credentials.json");
}

export function webStaticDir(): string {
	return resolve(repoRoot(), "web", "static");
}

export function workerSkillsSourceDir(): string {
	return resolve(repoRoot(), "worker", "workspace", "skills");
}
