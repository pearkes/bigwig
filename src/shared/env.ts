import { config } from "dotenv";

let loaded = false;

export function loadEnv(): void {
	if (loaded) return;
	config();
	loaded = true;
}

export function getEnv(name: string, fallback?: string): string {
	const value = process.env[name] ?? Bun.env[name] ?? fallback;
	return value ?? "";
}
