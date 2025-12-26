import { join } from "node:path";
import { getEnv } from "../shared/env";
import { expandHome } from "../shared/utils";

export let WORKSPACE_DIR = expandHome(getEnv("WORKSPACE_DIR", process.cwd()));

export let UPLOADS_DIR = join(WORKSPACE_DIR, "uploads");

export function setWorkspaceDir(nextDir: string): void {
	WORKSPACE_DIR = expandHome(nextDir);
	UPLOADS_DIR = join(WORKSPACE_DIR, "uploads");
}

export const BRIDGE_PORT = Number(getEnv("BIGWIG_BRIDGE_PORT", "9100"));

export const RECONNECT_DELAY_MS = 5000;

export const MAX_PENDING_UPLOADS = 50;
export const UPLOAD_TIMEOUT_SECONDS = 300;
export const MAX_CHUNK_SIZE = 1024 * 1024;
