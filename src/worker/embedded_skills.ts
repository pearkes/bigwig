import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import embeddedSkills from "./embedded_skills.json";

type EmbeddedSkillFile = {
	path: string;
	base64: string;
	mode?: number;
};

type EmbeddedSkillsManifest = {
	files: EmbeddedSkillFile[];
};

const manifest = embeddedSkills as EmbeddedSkillsManifest;

export async function writeEmbeddedSkills(
	targetDir: string,
	filter: (file: EmbeddedSkillFile) => boolean = () => true,
): Promise<void> {
	for (const file of manifest.files) {
		if (!filter(file)) {
			continue;
		}
		const dest = join(targetDir, "skills", file.path);
		await mkdir(dirname(dest), { recursive: true });
		await Bun.write(dest, Buffer.from(file.base64, "base64"));
		if (file.mode) {
			await chmod(dest, file.mode);
		}
		console.log(`[sync] Wrote embedded ${join("skills", file.path)}`);
	}
}

export async function writeEmbeddedSkillsToDir(
	targetDir: string,
	options: {
		filter?: (file: EmbeddedSkillFile) => boolean;
		stripPrefix?: string;
	} = {},
): Promise<void> {
	const filter = options.filter ?? (() => true);
	const stripPrefix = options.stripPrefix ?? "";

	for (const file of manifest.files) {
		if (!filter(file)) {
			continue;
		}
		let relativePath = file.path;
		if (stripPrefix && relativePath.startsWith(stripPrefix)) {
			relativePath = relativePath.slice(stripPrefix.length);
		}
		const dest = join(targetDir, relativePath);
		await mkdir(dirname(dest), { recursive: true });
		await Bun.write(dest, Buffer.from(file.base64, "base64"));
		if (file.mode) {
			await chmod(dest, file.mode);
		}
		console.log(`[sync] Wrote embedded ${relativePath}`);
	}
}
