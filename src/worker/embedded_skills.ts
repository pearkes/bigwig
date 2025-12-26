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
