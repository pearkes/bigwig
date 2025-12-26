import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { ServerInfo } from "../services/storageService";
import type { ThemeMode } from "../theme/theme";
import type { PairingClaim } from "../types/auth";
import { getOnboardingStyles } from "./onboardingStyles";

type OnboardingScreenProps = {
	errorMessage: string | null;
	pairingClaim: PairingClaim | null;
	pairingServerUrl: string | null;
	savedServer: ServerInfo | null;
	hasSavedCredentials: boolean;
	forcePairing?: boolean;
	resolvedTheme: ThemeMode;
	onExitPairing?: () => void;
	onLogout?: () => void;
	onQuickLogin: () => Promise<void>;
	onStartPairing: (params: {
		serverUrl: string;
		pairingCode?: string;
		pairingNonce?: string;
	}) => Promise<void>;
	onConfirmPairing: () => Promise<void>;
	onResetPairing: () => void;
};

type ParsedPayload = {
	serverUrl?: string;
	pairingNonce?: string;
};

const parsePairingPayload = (value: string): ParsedPayload => {
	try {
		const parsed = JSON.parse(value);
		if (parsed && typeof parsed === "object") {
			return {
				serverUrl: parsed.url || parsed.server_url,
				pairingNonce: parsed.pairing_nonce || parsed.nonce,
			};
		}
	} catch {}

	try {
		const url = new URL(value);
		const pairingNonce = url.searchParams.get("nonce") || undefined;
		const pairingCode = url.searchParams.get("code") || undefined;
		return {
			serverUrl: url.origin,
			pairingNonce: pairingNonce || pairingCode,
		};
	} catch {}

	return {};
};

const looksLikeNonce = (value: string): boolean =>
	/^[a-f0-9]{32}$/i.test(value);

export const OnboardingScreen = ({
	errorMessage,
	pairingClaim,
	pairingServerUrl,
	savedServer,
	hasSavedCredentials,
	forcePairing = false,
	resolvedTheme,
	onExitPairing,
	onLogout,
	onQuickLogin,
	onStartPairing,
	onConfirmPairing,
	onResetPairing,
}: OnboardingScreenProps) => {
	const onboardingStyles = useMemo(
		() => getOnboardingStyles(resolvedTheme),
		[resolvedTheme],
	);
	const statusBarStyle = resolvedTheme === "dark" ? "light" : "dark";
	const [serverUrl, setServerUrl] = useState("");
	const [pairingInput, setPairingInput] = useState("");
	const [isScanning, setIsScanning] = useState(false);
	const [showPairingForm, setShowPairingForm] = useState(
		!forcePairing && !hasSavedCredentials,
	);
	const [showResetConfirm, setShowResetConfirm] = useState(false);
	const [permissions, requestPermission] = useCameraPermissions();
	const placeholderTextColor = resolvedTheme === "dark" ? "#8c8c8c" : "#999";

	useEffect(() => {
		if (forcePairing) {
			setShowPairingForm(false);
		}
	}, [forcePairing]);

	const scanStatus = useMemo(() => {
		if (!permissions) return "unknown";
		if (permissions.granted) return "granted";
		if (permissions.canAskAgain) return "ask";
		return "denied";
	}, [permissions]);

	const handleScanPress = async () => {
		if (scanStatus === "granted") {
			setIsScanning(true);
			return;
		}
		if (scanStatus === "ask") {
			const result = await requestPermission();
			if (result.granted) {
				setIsScanning(true);
			}
			return;
		}
	};

	const handleBarcode = (data: string) => {
		const parsed = parsePairingPayload(data);
		if (parsed.serverUrl) setServerUrl(parsed.serverUrl);
		if (parsed.pairingNonce) {
			setPairingInput(parsed.pairingNonce);
		} else {
			setPairingInput(data);
		}
		setIsScanning(false);
	};

	const handleSubmit = async () => {
		const trimmedUrl = serverUrl.trim();
		const trimmedInput = pairingInput.trim();
		if (!trimmedInput) return;

		const parsed = parsePairingPayload(trimmedInput);
		const effectiveUrl = parsed.serverUrl || trimmedUrl;
		if (!effectiveUrl) return;
		const pairingNonce =
			parsed.pairingNonce ||
			(looksLikeNonce(trimmedInput) ? trimmedInput : undefined);
		const pairingCode = pairingNonce ? undefined : trimmedInput;
		try {
			await onStartPairing({
				serverUrl: effectiveUrl,
				pairingCode,
				pairingNonce,
			});
		} catch {}
	};

	const isContinueDisabled = useMemo(() => {
		const trimmedUrl = serverUrl.trim();
		const trimmedInput = pairingInput.trim();
		return !trimmedUrl || !trimmedInput;
	}, [serverUrl, pairingInput]);

	const renderPairingConfirm = () => (
		<View style={onboardingStyles.card}>
			<Text style={onboardingStyles.title}>Confirm Server</Text>
			{pairingServerUrl && (
				<>
					<Text style={onboardingStyles.label}>Server URL</Text>
					<Text style={onboardingStyles.value}>{pairingServerUrl}</Text>
				</>
			)}
			<Text style={onboardingStyles.label}>Server ID</Text>
			<Text style={onboardingStyles.value}>
				{pairingClaim?.serverFingerprint}
			</Text>
			<Text style={onboardingStyles.label}>Match Code</Text>
			<Text style={onboardingStyles.matchCode}>{pairingClaim?.matchCode}</Text>
			<TouchableOpacity
				style={onboardingStyles.primaryButton}
				onPress={async () => {
					try {
						await onConfirmPairing();
					} catch {}
				}}
			>
				<Text style={onboardingStyles.primaryButtonText}>Confirm & Pair</Text>
			</TouchableOpacity>
			<TouchableOpacity
				style={onboardingStyles.secondaryButton}
				onPress={onResetPairing}
			>
				<Text style={onboardingStyles.secondaryButtonText}>Start Over</Text>
			</TouchableOpacity>
		</View>
	);

	const renderQuickLogin = () => {
		if (!hasSavedCredentials || pairingClaim) return null;
		return (
			<View style={onboardingStyles.card}>
				<Text style={onboardingStyles.title}>
					{forcePairing ? "Paired Server" : "Welcome Back"}
				</Text>
				<Text style={onboardingStyles.subtitle}>
					{forcePairing
						? "You're already paired to this server."
						: "We found your paired server. Tap below to reconnect."}
				</Text>
				<Text style={onboardingStyles.label}>Server URL</Text>
				<Text style={onboardingStyles.value}>{savedServer?.url}</Text>
				<Text style={onboardingStyles.label}>Server ID</Text>
				<Text style={onboardingStyles.value}>{savedServer?.fingerprint}</Text>
				{forcePairing ? (
					<TouchableOpacity
						style={onboardingStyles.primaryButton}
						onPress={onExitPairing}
					>
						<Text style={onboardingStyles.primaryButtonText}>Continue</Text>
					</TouchableOpacity>
				) : (
					<TouchableOpacity
						style={onboardingStyles.primaryButton}
						onPress={async () => {
							try {
								await onQuickLogin();
							} catch {}
						}}
					>
						<Text style={onboardingStyles.primaryButtonText}>Log In</Text>
					</TouchableOpacity>
				)}
				{!forcePairing && (
					<TouchableOpacity
						style={onboardingStyles.secondaryButton}
						onPress={() => setShowPairingForm(true)}
					>
						<Text style={onboardingStyles.secondaryButtonText}>
							Pair a Different Server
						</Text>
					</TouchableOpacity>
				)}
			</View>
		);
	};

	const renderPairingForm = () => (
		<View style={onboardingStyles.card}>
			<Text style={onboardingStyles.title}>Pair Your Server</Text>
			<Text style={onboardingStyles.subtitle}>
				Scan the QR from the server console or enter the pairing code manually.
			</Text>
			<Text style={onboardingStyles.label}>Server URL</Text>
			<TextInput
				style={onboardingStyles.input}
				placeholder="https://your-server"
				placeholderTextColor={placeholderTextColor}
				autoCapitalize="none"
				autoCorrect={false}
				value={serverUrl}
				onChangeText={setServerUrl}
			/>
			<Text style={onboardingStyles.label}>Pairing Code or QR Payload</Text>
			<TextInput
				style={onboardingStyles.input}
				placeholder="ABC12345 or paste QR payload"
				placeholderTextColor={placeholderTextColor}
				autoCapitalize="none"
				autoCorrect={false}
				value={pairingInput}
				onChangeText={setPairingInput}
			/>
			<TouchableOpacity
				style={[
					onboardingStyles.primaryButton,
					isContinueDisabled && onboardingStyles.primaryButtonDisabled,
				]}
				onPress={handleSubmit}
				disabled={isContinueDisabled}
			>
				<Text style={onboardingStyles.primaryButtonText}>Continue</Text>
			</TouchableOpacity>
			<TouchableOpacity
				style={onboardingStyles.secondaryButton}
				onPress={handleScanPress}
			>
				<Text style={onboardingStyles.secondaryButtonText}>Scan QR</Text>
			</TouchableOpacity>
			{scanStatus === "denied" && (
				<Text style={onboardingStyles.helperText}>
					Camera access is disabled in Settings.
				</Text>
			)}
		</View>
	);

	return (
		<View style={onboardingStyles.container}>
			<StatusBar style={statusBarStyle} />
			{errorMessage && (
				<Text style={onboardingStyles.errorText}>{errorMessage}</Text>
			)}
			{pairingClaim ? renderPairingConfirm() : renderQuickLogin()}
			{!pairingClaim && !forcePairing && showPairingForm && renderPairingForm()}
			{onLogout && hasSavedCredentials && (
				<TouchableOpacity
					style={onboardingStyles.logoutButton}
					onPress={() => setShowResetConfirm(true)}
				>
					<Text style={onboardingStyles.logoutButtonText}>Reset pairing</Text>
				</TouchableOpacity>
			)}
			<Modal visible={showResetConfirm} transparent animationType="fade">
				<View style={onboardingStyles.scanOverlay}>
					<View style={onboardingStyles.card}>
						<Text style={onboardingStyles.title}>Reset pairing?</Text>
						<Text style={onboardingStyles.subtitle}>
							This removes your device key and current server pairing. You can
							pair again afterward.
						</Text>
						<TouchableOpacity
							style={onboardingStyles.primaryButton}
							onPress={async () => {
								setShowResetConfirm(false);
								if (onLogout) {
									await onLogout();
								}
							}}
						>
							<Text style={onboardingStyles.primaryButtonText}>
								Reset pairing
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={onboardingStyles.secondaryButton}
							onPress={() => setShowResetConfirm(false)}
						>
							<Text style={onboardingStyles.secondaryButtonText}>Cancel</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>
			<Modal visible={isScanning} transparent animationType="fade">
				<View style={onboardingStyles.scanOverlay}>
					<View style={onboardingStyles.scanWindow}>
						<CameraView
							style={onboardingStyles.camera}
							barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
							onBarcodeScanned={({ data }) => handleBarcode(data)}
						/>
					</View>
					<TouchableOpacity
						style={onboardingStyles.secondaryButton}
						onPress={() => setIsScanning(false)}
					>
						<Text style={onboardingStyles.secondaryButtonText}>Cancel</Text>
					</TouchableOpacity>
				</View>
			</Modal>
		</View>
	);
};
