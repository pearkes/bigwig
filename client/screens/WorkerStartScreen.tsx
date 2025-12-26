import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Share,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import type { ThemeMode } from "../theme/theme";
import { getIdleStyles } from "./idleStyles";

type WorkerStartScreenProps = {
	onBack: () => void;
	resolvedTheme: ThemeMode;
};

export const WorkerStartScreen = ({
	onBack,
	resolvedTheme,
}: WorkerStartScreenProps) => {
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const command = "bigwig worker";
	const idleStyles = useMemo(
		() => getIdleStyles(resolvedTheme),
		[resolvedTheme],
	);
	const statusBarStyle = resolvedTheme === "dark" ? "light" : "dark";
	const shareIconColor = resolvedTheme === "dark" ? "#f5f5f5" : "#333";
	const activityColor = resolvedTheme === "dark" ? "#f5f5f5" : "#333";

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
			}
		};
	}, []);

	const handleCopy = async () => {
		await Clipboard.setStringAsync(command);
		setCopied(true);
		if (copyTimeoutRef.current) {
			clearTimeout(copyTimeoutRef.current);
		}
		copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
	};

	return (
		<KeyboardAvoidingView
			style={idleStyles.container}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
		>
			<StatusBar style={statusBarStyle} />

			<View style={idleStyles.centered}>
				<View style={idleStyles.card}>
					<Text style={idleStyles.title}>Run your worker</Text>
					<Text style={idleStyles.subtitle}>
						Start the worker on the machine you paired in a safe working
						directory or sandbox. The app will connect automatically once it is
						running.
					</Text>
					<View style={idleStyles.codeBlock}>
						<Text style={idleStyles.codeText}>{command}</Text>
					</View>
					<View style={idleStyles.actionRow}>
						<TouchableOpacity
							style={idleStyles.secondaryButton}
							onPress={handleCopy}
						>
							{copied ? (
								<View style={idleStyles.copiedRow}>
									<Ionicons name="checkmark" size={18} color="#4CAF50" />
									<Text style={idleStyles.secondaryButtonText}>Copied</Text>
								</View>
							) : (
								<Text style={idleStyles.secondaryButtonText}>Copy</Text>
							)}
						</TouchableOpacity>
						<TouchableOpacity
							style={idleStyles.iconButton}
							onPress={() => Share.share({ message: command })}
						>
							<Ionicons name="share-outline" size={18} color={shareIconColor} />
						</TouchableOpacity>
					</View>
					<View style={idleStyles.loadingRow}>
						<ActivityIndicator size="small" color={activityColor} />
						<Text style={[idleStyles.helperText, idleStyles.loadingText]}>
							Waiting for connection...
						</Text>
					</View>
				</View>
				<View style={idleStyles.logoutFooter}>
					<Text style={idleStyles.logoutLink} onPress={onBack}>
						Go back
					</Text>
				</View>
			</View>
		</KeyboardAvoidingView>
	);
};
