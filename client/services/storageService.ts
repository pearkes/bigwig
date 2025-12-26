import * as SecureStore from "expo-secure-store";
import {
	DEVICE_ID_KEY,
	DEVICE_KEYPAIR_KEY,
	SERVER_INFO_KEY,
	SESSION_KEY,
	SETTINGS_KEY,
} from "../constants/storage";
import type { ThemePreference } from "../theme/theme";

export type AppSettings = {
	autoStartVoice?: boolean;
	muteMicByDefault?: boolean;
	showTranscript?: boolean;
	themePreference?: ThemePreference;
	debugLogsEnabled?: boolean;
};

export type ServerInfo = {
	url: string;
	fingerprint: string;
};

export type DeviceKeypair = {
	publicKey: string;
	privateKey: string;
};

export const getSession = async (): Promise<string | null> => {
	try {
		return await SecureStore.getItemAsync(SESSION_KEY);
	} catch {
		return null;
	}
};

export const setSession = async (value: string): Promise<void> => {
	try {
		await SecureStore.setItemAsync(SESSION_KEY, value);
	} catch (e) {
		console.error("Failed to save session:", e);
	}
};

export const clearSession = async (): Promise<void> => {
	try {
		await SecureStore.deleteItemAsync(SESSION_KEY);
	} catch {}
};

export const getServerInfo = async (): Promise<ServerInfo | null> => {
	try {
		const stored = await SecureStore.getItemAsync(SERVER_INFO_KEY);
		return stored ? (JSON.parse(stored) as ServerInfo) : null;
	} catch {
		return null;
	}
};

export const setServerInfo = async (info: ServerInfo): Promise<void> => {
	try {
		await SecureStore.setItemAsync(SERVER_INFO_KEY, JSON.stringify(info));
	} catch {}
};

export const clearServerInfo = async (): Promise<void> => {
	try {
		await SecureStore.deleteItemAsync(SERVER_INFO_KEY);
	} catch {}
};

export const getDeviceKeypair = async (): Promise<DeviceKeypair | null> => {
	try {
		const stored = await SecureStore.getItemAsync(DEVICE_KEYPAIR_KEY);
		return stored ? (JSON.parse(stored) as DeviceKeypair) : null;
	} catch {
		return null;
	}
};

export const setDeviceKeypair = async (keys: DeviceKeypair): Promise<void> => {
	try {
		await SecureStore.setItemAsync(DEVICE_KEYPAIR_KEY, JSON.stringify(keys));
	} catch {}
};

export const clearDeviceKeypair = async (): Promise<void> => {
	try {
		await SecureStore.deleteItemAsync(DEVICE_KEYPAIR_KEY);
	} catch {}
};

export const getDeviceId = async (): Promise<string | null> => {
	try {
		return await SecureStore.getItemAsync(DEVICE_ID_KEY);
	} catch {
		return null;
	}
};

export const setDeviceId = async (value: string): Promise<void> => {
	try {
		await SecureStore.setItemAsync(DEVICE_ID_KEY, value);
	} catch {}
};

export const clearDeviceId = async (): Promise<void> => {
	try {
		await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
	} catch {}
};

export const getSettings = async (): Promise<AppSettings | null> => {
	try {
		const stored = await SecureStore.getItemAsync(SETTINGS_KEY);
		return stored ? (JSON.parse(stored) as AppSettings) : null;
	} catch {
		return null;
	}
};

export const setSettings = async (
	newSettings: Partial<AppSettings>,
): Promise<void> => {
	try {
		const stored = await SecureStore.getItemAsync(SETTINGS_KEY);
		const current = stored ? (JSON.parse(stored) as AppSettings) : {};
		const updated = { ...current, ...newSettings };
		await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(updated));
	} catch {}
};
