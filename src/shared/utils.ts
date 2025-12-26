import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function debug(message: string): void {
	console.log(message);
}

export function nowMs(): number {
	return Date.now();
}

export function randomHex(bytes: number): string {
	const data = new Uint8Array(bytes);
	crypto.getRandomValues(data);
	return Buffer.from(data).toString("hex");
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function expandHome(path: string): string {
	if (path.startsWith("~")) {
		const home = Bun.env.HOME || process.env.HOME || "";
		return home ? path.replace("~", home) : path;
	}
	return path;
}

export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
	try {
		const raw = await readFile(path, "utf8");
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export async function writeJsonFile(
	path: string,
	data: unknown,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const raw = JSON.stringify(data, null, 2);
	await writeFile(path, raw, "utf8");
}

export function safeJsonParse<T>(value: string): T | null {
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}
