import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import * as Crypto from "expo-crypto";
import type { DeviceKeypair } from "./storageService";

ed25519.etc.sha512Sync = sha512;
ed25519.etc.sha512Async = async (msg) => sha512(msg);

export type DeviceAuthPayload = {
	device_id: string;
	timestamp: number;
	nonce: string;
	signature: string;
};

export const bytesToBase64Url = (bytes: Uint8Array): string => {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
};

export const base64UrlToBytes = (input: string): Uint8Array => {
	const padded =
		input.replace(/-/g, "+").replace(/_/g, "/") +
		"===".slice((input.length + 3) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
};

export const generateDeviceKeypair = async (): Promise<DeviceKeypair> => {
	const privateKey = await Crypto.getRandomBytesAsync(32);
	const publicKey = await ed25519.getPublicKey(privateKey);
	return {
		privateKey: bytesToBase64Url(privateKey),
		publicKey: bytesToBase64Url(publicKey),
	};
};

export const signDeviceRequest = async (
	method: string,
	path: string,
	timestamp: number,
	nonce: string,
	privateKey: string,
): Promise<string> => {
	const message = `${method}\n${path}\n${timestamp}\n${nonce}`;
	const signature = await ed25519.sign(
		new TextEncoder().encode(message),
		base64UrlToBytes(privateKey),
	);
	return bytesToBase64Url(signature);
};

export const signPairing = async (
	pairingNonce: string,
	serverFingerprint: string,
	privateKey: string,
): Promise<string> => {
	const message = `pairing:${pairingNonce}:${serverFingerprint}`;
	const signature = await ed25519.sign(
		new TextEncoder().encode(message),
		base64UrlToBytes(privateKey),
	);
	return bytesToBase64Url(signature);
};
