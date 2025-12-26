import * as Crypto from "expo-crypto";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { safeJson } from "../services/apiService";
import {
	bytesToBase64Url,
	generateDeviceKeypair,
	signDeviceRequest,
	signPairing,
} from "../services/deviceAuthService";
import type { ServerInfo } from "../services/storageService";
import {
	clearDeviceId,
	clearDeviceKeypair,
	clearSession,
	clearServerInfo as clearStoredServerInfo,
	getDeviceId,
	getDeviceKeypair,
	getServerInfo,
	setDeviceId,
	setDeviceKeypair,
	setSession,
} from "../services/storageService";
import type { AuthStatus, PairingClaim } from "../types/auth";
import { useSettings } from "./SettingsContext";
import { useUI } from "./UIContext";

type AuthContextValue = {
	authStatus: AuthStatus;
	savedServer: ServerInfo | null;
	hasSavedCredentials: boolean;
	checkAuth: () => Promise<void>;
	logout: () => Promise<void>;
	pairingClaim: PairingClaim | null;
	pairingServerUrl: string | null;
	startPairing: (params: {
		serverUrl: string;
		pairingCode?: string;
		pairingNonce?: string;
	}) => Promise<void>;
	confirmPairing: () => Promise<void>;
	resetPairing: () => void;
	requestWorkerJoinToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
	const {
		serverUrl,
		setServerInfo: setServerInfoState,
		clearServerInfo,
	} = useSettings();
	const { setErrorMessage } = useUI();
	const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
	const [pairingClaim, setPairingClaim] = useState<PairingClaim | null>(null);
	const [pendingServerUrl, setPendingServerUrl] = useState<string | null>(null);
	const [savedServer, setSavedServer] = useState<ServerInfo | null>(null);
	const [hasSavedCredentials, setHasSavedCredentials] = useState(false);

	const createNonce = useCallback(async (): Promise<string> => {
		const bytes = await Crypto.getRandomBytesAsync(16);
		return bytesToBase64Url(bytes);
	}, []);

	const checkAuth = useCallback(async () => {
		const server = await getServerInfo();
		const deviceId = await getDeviceId();
		const keypair = await getDeviceKeypair();

		setSavedServer(server);
		setHasSavedCredentials(Boolean(server && deviceId && keypair));

		if (!server || !deviceId || !keypair) {
			setAuthStatus("unpaired");
			return;
		}

		setAuthStatus("loading");
		try {
			const timestamp = Date.now();
			const nonce = await createNonce();
			const signature = await signDeviceRequest(
				"POST",
				"/device/session",
				timestamp,
				nonce,
				keypair.privateKey,
			);

			const res = await fetch(`${server.url}/device/session`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					device_id: deviceId,
					timestamp,
					nonce,
					signature,
				}),
			});
			const body = await safeJson(res);
			if (!res.ok) {
				throw new Error(
					body?.error || `Session request failed (status ${res.status})`,
				);
			}
			await setSession(body?.token);
			setAuthStatus("authenticated");
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			console.error("Device auth failed:", error);
			setAuthStatus("unpaired");
			setErrorMessage(error.message || "Failed to authenticate");
		}
	}, [createNonce, setErrorMessage]);

	useEffect(() => {
		checkAuth();
	}, [checkAuth]);

	const startPairing = async ({
		serverUrl: url,
		pairingCode,
		pairingNonce,
	}: {
		serverUrl: string;
		pairingCode?: string;
		pairingNonce?: string;
	}) => {
		try {
			setErrorMessage(null);
			const res = await fetch(`${url}/pairing/claim`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					pairingNonce
						? { pairing_nonce: pairingNonce }
						: { pairing_code: pairingCode },
				),
			});
			const body = await safeJson(res);
			if (!res.ok) {
				throw new Error(
					body?.error || `Pairing claim failed (status ${res.status})`,
				);
			}

			const claim: PairingClaim = {
				serverFingerprint: body?.server_fingerprint,
				matchCode: body?.match_code,
				pairingNonce: body?.pairing_nonce,
				expiresAt: body?.expires_at,
			};
			setPairingClaim(claim);
			setPendingServerUrl(url);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setErrorMessage(error.message || "Pairing claim failed");
			throw error;
		}
	};

	const confirmPairing = async () => {
		if (!pairingClaim || !pendingServerUrl) {
			throw new Error("Pairing not started");
		}
		try {
			setErrorMessage(null);
			const keypair = await generateDeviceKeypair();
			const signature = await signPairing(
				pairingClaim.pairingNonce,
				pairingClaim.serverFingerprint,
				keypair.privateKey,
			);
			const res = await fetch(`${pendingServerUrl}/pairing/confirm`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pairing_nonce: pairingClaim.pairingNonce,
					device_public_key: keypair.publicKey,
					signature,
				}),
			});
			const body = await safeJson(res);
			if (!res.ok) {
				throw new Error(body?.error || `Pairing failed (status ${res.status})`);
			}

			await setDeviceKeypair(keypair);
			await setDeviceId(body?.device_id);
			setServerInfoState({
				url: pendingServerUrl,
				fingerprint: pairingClaim.serverFingerprint,
			});
			setPairingClaim(null);
			setPendingServerUrl(null);
			await checkAuth();
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setErrorMessage(error.message || "Pairing failed");
			throw error;
		}
	};

	const resetPairing = () => {
		setPairingClaim(null);
		setPendingServerUrl(null);
		setErrorMessage(null);
	};

	const logout = async () => {
		await clearSession();
		await clearDeviceId();
		await clearDeviceKeypair();
		await clearStoredServerInfo();
		clearServerInfo();
		setPairingClaim(null);
		setPendingServerUrl(null);
		setSavedServer(null);
		setHasSavedCredentials(false);
		setErrorMessage(null);
		setAuthStatus("unpaired");
	};

	const requestWorkerJoinToken = async (): Promise<string | null> => {
		if (!serverUrl) return null;
		const deviceId = await getDeviceId();
		const keypair = await getDeviceKeypair();
		if (!deviceId || !keypair) return null;
		const timestamp = Date.now();
		const nonce = await createNonce();
		const signature = await signDeviceRequest(
			"POST",
			"/device/worker-join-token",
			timestamp,
			nonce,
			keypair.privateKey,
		);
		const res = await fetch(`${serverUrl}/device/worker-join-token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				device_id: deviceId,
				timestamp,
				nonce,
				signature,
			}),
		});
		const body = await safeJson(res);
		if (!res.ok) {
			throw new Error(
				body?.error || `Failed to create join token (status ${res.status})`,
			);
		}
		return body?.token || null;
	};

	const value: AuthContextValue = {
		authStatus,
		savedServer,
		hasSavedCredentials,
		checkAuth,
		logout,
		pairingClaim,
		pairingServerUrl: pendingServerUrl,
		startPairing,
		confirmPairing,
		resetPairing,
		requestWorkerJoinToken,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};
