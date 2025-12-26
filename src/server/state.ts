import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { webCredentialsPath } from "../shared/paths";
import { randomHex } from "../shared/utils";

export type ServerIdentity = {
	public_key: string;
	private_key: string;
	fingerprint: string;
	created_at: string;
};

export type PairedDevice = {
	device_id: string;
	public_key: string;
	paired_at: string;
};

export type PairingRecord = {
	nonce: string;
	pairing_code: string;
	match_code: string;
	expires_at: number;
	created_at: number;
};

export type SessionRecord = {
	device_id: string;
	expires_at: number;
};

export type JoinTokenRecord = {
	device_id: string;
	expires_at: number;
};

export type WorkerRecord = {
	worker_id: string;
	public_key: string;
	credential: string;
	created_at: number;
	last_seen: number;
};

export type ServerState = {
	version: 1;
	server_identity: ServerIdentity | null;
	paired_device: PairedDevice | null;
	pairing: PairingRecord | null;
	sessions: Record<string, SessionRecord>;
	join_tokens: Record<string, JoinTokenRecord>;
	workers: Record<string, WorkerRecord>;
};

const STATE_PATH = webCredentialsPath();

function bytesToHex(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}

function sha256Hex(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

function deriveMatchCode(nonce: string): string {
	const hash = sha256Hex(nonce);
	const num = parseInt(hash.slice(0, 8), 16) % 1_000_000;
	return String(num).padStart(6, "0");
}

function derivePairingCode(nonce: string): string {
	return nonce.slice(0, 8).toUpperCase();
}

function generateIdentity(): ServerIdentity {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	const publicKeyDer = publicKey.export({
		format: "der",
		type: "spki",
	}) as Buffer;
	const privateKeyDer = privateKey.export({
		format: "der",
		type: "pkcs8",
	}) as Buffer;
	const fingerprint = sha256Hex(publicKeyDer.toString("base64")).slice(0, 16);
	return {
		public_key: publicKeyDer.toString("base64"),
		private_key: privateKeyDer.toString("base64"),
		fingerprint,
		created_at: new Date().toISOString(),
	};
}

export function loadServerState(): ServerState {
	let raw: ServerState | null = null;
	try {
		raw = JSON.parse(readFileSync(STATE_PATH, "utf8")) as ServerState;
	} catch {
		raw = null;
	}

	let needsSave = false;
	const state: ServerState = {
		version: 1,
		server_identity: raw?.server_identity ?? null,
		paired_device: raw?.paired_device ?? null,
		pairing: raw?.pairing ?? null,
		sessions: raw?.sessions ?? {},
		join_tokens: raw?.join_tokens ?? {},
		workers: raw?.workers ?? {},
	};

	if (!state.server_identity) {
		state.server_identity = generateIdentity();
		needsSave = true;
	}

	if (needsSave) {
		saveServerState(state);
	}

	return state;
}

export function saveServerState(state: ServerState): void {
	mkdirSync(dirname(STATE_PATH), { recursive: true });
	const payload = JSON.stringify(state, null, 2);
	writeFileSync(STATE_PATH, payload, "utf8");
}

export function ensurePairing(
	state: ServerState,
	ttlMs: number,
	now = Date.now(),
): PairingRecord | null {
	if (state.paired_device) {
		state.pairing = null;
		return null;
	}

	if (state.pairing && state.pairing.expires_at > now) {
		return state.pairing;
	}

	const nonce = randomHex(16);
	const pairing: PairingRecord = {
		nonce,
		pairing_code: derivePairingCode(nonce),
		match_code: deriveMatchCode(nonce),
		created_at: now,
		expires_at: now + ttlMs,
	};
	state.pairing = pairing;
	return pairing;
}

export function pruneExpiredSessions(
	state: ServerState,
	now = Date.now(),
): boolean {
	let pruned = false;
	for (const [token, session] of Object.entries(state.sessions)) {
		if (session.expires_at <= now) {
			delete state.sessions[token];
			pruned = true;
		}
	}
	return pruned;
}

export function pruneExpiredJoinTokens(
	state: ServerState,
	now = Date.now(),
): boolean {
	let pruned = false;
	for (const [token, record] of Object.entries(state.join_tokens)) {
		if (record.expires_at <= now) {
			delete state.join_tokens[token];
			pruned = true;
		}
	}
	return pruned;
}

export function nextSessionToken(): string {
	return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function nextWorkerCredential(): string {
	return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}
