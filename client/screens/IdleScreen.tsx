import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Share,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { HeaderStatusMenu } from "../components/HeaderStatusMenu";
import { SettingsModal } from "../components/modals/SettingsModal";
import { WorkerInfoModal } from "../components/modals/WorkerInfoModal";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import type { ThemeMode, ThemePreference } from "../theme/theme";
import { getIdleStyles } from "./idleStyles";

type IdleScreenProps = {
	isConnecting: boolean;
	workerConnected: boolean;
	errorMessage: string | null;
	showDropdown: boolean;
	onToggleDropdown: () => void;
	onConnect: () => void;
	onBackToPairing: () => void;
	onOpenWorkerInfo: () => void;
	onCloseWorkerInfo: () => void;
	onOpenSettings: () => void;
	onCloseSettings: () => void;
	showWorkerInfo: boolean;
	showSettings: boolean;
	workerId: string | null;
	workerWorkspace: { path?: string } | null;
	muteMicByDefault: boolean;
	autoStartVoice: boolean;
	showTranscript: boolean;
	onToggleMuteMicByDefault: () => void;
	onToggleAutoStartVoice: () => void;
	onToggleShowTranscript: () => void;
	themePreference: ThemePreference;
	resolvedTheme: ThemeMode;
	onSetThemePreference: (preference: ThemePreference) => void;
};

export const IdleScreen = ({
	isConnecting,
	workerConnected,
	errorMessage,
	showDropdown,
	onToggleDropdown,
	onConnect,
	onBackToPairing,
	onOpenWorkerInfo,
	onCloseWorkerInfo,
	onOpenSettings,
	onCloseSettings,
	showWorkerInfo,
	showSettings,
	workerId,
	workerWorkspace,
	muteMicByDefault,
	autoStartVoice,
	showTranscript,
	onToggleMuteMicByDefault,
	onToggleAutoStartVoice,
	onToggleShowTranscript,
	themePreference,
	resolvedTheme,
	onSetThemePreference,
}: IdleScreenProps) => {
	const { requestWorkerJoinToken } = useAuth();
	const { serverUrl } = useSettings();
	const idleStyles = useMemo(
		() => getIdleStyles(resolvedTheme),
		[resolvedTheme],
	);
	const statusBarStyle = resolvedTheme === "dark" ? "light" : "dark";
	const activityColor = resolvedTheme === "dark" ? "#111" : "#fff";
	const shareIconColor = resolvedTheme === "dark" ? "#f5f5f5" : "#333";
	const [joinToken, setJoinToken] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [joinError, setJoinError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const joinCommand =
		joinToken &&
		`bigwig join --token ${joinToken}${serverUrl ? ` --server ${serverUrl}` : ""}`;
	const hasJoinCommand = Boolean(joinCommand);

	useEffect(() => {
		if (workerConnected) {
			setJoinToken(null);
			setJoinError(null);
			setIsGenerating(false);
		}
	}, [workerConnected]);

	useEffect(() => {
		setCopied(false);
	}, []);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
			}
		};
	}, []);

	const handleGenerateToken = async () => {
		setIsGenerating(true);
		setJoinError(null);
		try {
			const token = await requestWorkerJoinToken();
			const trimmed = token?.trim() || "";
			if (!trimmed) {
				throw new Error("Failed to create join token");
			}
			setJoinToken(trimmed);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setJoinError(error.message || "Failed to create join token");
		} finally {
			setIsGenerating(false);
		}
	};

	const handleCopyToken = async () => {
		if (joinCommand) {
			await Clipboard.setStringAsync(joinCommand);
			setCopied(true);
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
			}
			copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
		}
	};

	return (
		<KeyboardAvoidingView
			style={idleStyles.container}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
		>
			<StatusBar style={statusBarStyle} />

			{/* Header */}
			{workerConnected && (
				<View style={idleStyles.header}>
					<HeaderStatusMenu
						label="Ready"
						dotColor="#4CAF50"
						showDropdown={showDropdown}
						onToggle={onToggleDropdown}
						variant={resolvedTheme === "dark" ? "dark" : undefined}
						disabled={isConnecting}
						items={[
							{ label: "Worker Info", onPress: onOpenWorkerInfo },
							{ label: "Settings", onPress: onOpenSettings, isLast: true },
						]}
					/>
				</View>
			)}

			{/* Main content */}
			<View style={idleStyles.centered}>
				<View style={idleStyles.card}>
					<Text style={idleStyles.title}>
						{workerConnected ? "Ready" : "Add your worker"}
					</Text>
					<Text style={idleStyles.subtitle}>
						{workerConnected
							? "Start a session when you're ready."
							: "Generate a join token, then run the command on your machine."}
					</Text>
					{!workerConnected && (
						<Text style={idleStyles.bodyText}>
							The worker is a small process that can run anywhere. It executes
							the CLI agent and runs tool calls (files, web, shell) in your
							sandbox. Important security considerations should be made.
						</Text>
					)}

					{errorMessage && (
						<Text style={idleStyles.errorText}>{errorMessage}</Text>
					)}

					{workerConnected ? (
						<TouchableOpacity
							style={[
								idleStyles.primaryButton,
								isConnecting && idleStyles.btnDisabled,
							]}
							onPress={onConnect}
							disabled={isConnecting}
							activeOpacity={0.7}
						>
							{isConnecting ? (
								<View style={idleStyles.loadingRow}>
									<ActivityIndicator size="small" color={activityColor} />
									<Text
										style={[
											idleStyles.primaryButtonText,
											idleStyles.loadingText,
										]}
									>
										Connecting...
									</Text>
								</View>
							) : (
								<Text style={idleStyles.primaryButtonText}>Start</Text>
							)}
						</TouchableOpacity>
					) : (
						<>
							{hasJoinCommand ? (
								<>
									<Text style={idleStyles.label}>Worker command</Text>
									<View style={idleStyles.codeBlock}>
										<ScrollView
											horizontal
											showsHorizontalScrollIndicator={false}
										>
											<Text style={idleStyles.codeText}>
												bigwig join{"\n"} --token {joinToken}
												{serverUrl ? `\n  --server ${serverUrl}` : ""}
											</Text>
										</ScrollView>
									</View>
									<View style={idleStyles.actionRow}>
										<TouchableOpacity
											style={idleStyles.secondaryButton}
											onPress={handleCopyToken}
										>
											{copied ? (
												<View style={idleStyles.copiedRow}>
													<Ionicons
														name="checkmark"
														size={18}
														color="#4CAF50"
													/>
													<Text style={idleStyles.secondaryButtonText}>
														Copied
													</Text>
												</View>
											) : (
												<Text style={idleStyles.secondaryButtonText}>Copy</Text>
											)}
										</TouchableOpacity>
										<TouchableOpacity
											style={idleStyles.iconButton}
											onPress={() =>
												joinCommand && Share.share({ message: joinCommand })
											}
										>
											<Ionicons
												name="share-outline"
												size={18}
												color={shareIconColor}
											/>
										</TouchableOpacity>
									</View>
								</>
							) : (
								<TouchableOpacity
									style={[
										idleStyles.secondaryButton,
										isGenerating && idleStyles.btnDisabled,
									]}
									onPress={handleGenerateToken}
									disabled={isGenerating}
								>
									<Text style={idleStyles.secondaryButtonText}>
										{isGenerating ? "Generating..." : "Generate Join Token"}
									</Text>
								</TouchableOpacity>
							)}
							{joinError && (
								<Text style={idleStyles.errorText}>{joinError}</Text>
							)}
							<Text style={idleStyles.helperText}>
								Once you connect a worker, this screen will update.
							</Text>
						</>
					)}
				</View>
				{!workerConnected && (
					<View style={idleStyles.logoutFooter}>
						{joinToken && (
							<TouchableOpacity
								style={idleStyles.regenerateButton}
								onPress={handleGenerateToken}
								disabled={isGenerating}
							>
								<Text style={idleStyles.regenerateText}>
									{isGenerating ? "Generating..." : "Regenerate token"}
								</Text>
							</TouchableOpacity>
						)}
						<Text style={idleStyles.backLink} onPress={onBackToPairing}>
							Back to pairing
						</Text>
					</View>
				)}
			</View>

			{/* Modals */}
			<WorkerInfoModal
				visible={showWorkerInfo}
				workerConnected={workerConnected}
				workerId={workerId}
				workerWorkspace={workerWorkspace}
				onClose={onCloseWorkerInfo}
				resolvedTheme={resolvedTheme}
			/>
			<SettingsModal
				visible={showSettings}
				onClose={onCloseSettings}
				muteMicByDefault={muteMicByDefault}
				onToggleMuteMicByDefault={onToggleMuteMicByDefault}
				autoStartVoice={autoStartVoice}
				onToggleAutoStartVoice={onToggleAutoStartVoice}
				showTranscript={showTranscript}
				onToggleShowTranscript={onToggleShowTranscript}
				themePreference={themePreference}
				resolvedTheme={resolvedTheme}
				onSetThemePreference={onSetThemePreference}
			/>
		</KeyboardAvoidingView>
	);
};
