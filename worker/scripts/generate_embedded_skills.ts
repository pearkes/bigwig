import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

type EmbeddedSkillFile = {
	path: string;
	base64: string;
	mode?: number;
};

type EmbeddedSkillsManifest = {
	files: EmbeddedSkillFile[];
};

const ROOT_DIR = process.cwd();
const SOURCE_DIR = join(ROOT_DIR, "worker", "workspace", "skills");
const OUTPUT_PATH = join(ROOT_DIR, "src", "worker", "embedded_skills.json");

async function walk(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walk(fullPath)));
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		files.push(fullPath);
	}
	return files;
}

function toPosixPath(path: string): string {
	return path.split(sep).join("/");
}

async function buildManifest(): Promise<EmbeddedSkillsManifest> {
	const files = await walk(SOURCE_DIR);
	const manifestFiles: EmbeddedSkillFile[] = [];

	for (const filePath of files) {
		const relPath = toPosixPath(relative(SOURCE_DIR, filePath));
		const contents = await readFile(filePath);
		const fileStat = await stat(filePath);
		const mode = fileStat.mode & 0o777;

		const entry: EmbeddedSkillFile = {
			path: relPath,
			base64: contents.toString("base64"),
		};

		if (mode & 0o111) {
			entry.mode = mode;
		}

		manifestFiles.push(entry);
	}

	manifestFiles.sort((a, b) => a.path.localeCompare(b.path));
	return { files: manifestFiles };
}

async function main(): Promise<void> {
	const manifest = await buildManifest();
	const json = `${JSON.stringify(manifest, null, "\t")}\n`;
	await writeFile(OUTPUT_PATH, json);
	console.log(`[build] Wrote ${OUTPUT_PATH}`);
}

await main();
