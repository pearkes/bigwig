import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../context/AuthContext";
import type { ThemeMode } from "../../theme/theme";

type WorkerWorkspace = {
	path?: string;
} | null;

type WorkerInfoModalProps = {
	visible: boolean;
	workerConnected: boolean;
	workerId: string | null;
	workerWorkspace: WorkerWorkspace;
	onClose: () => void;
	resolvedTheme: ThemeMode;
};

export const WorkerInfoModal = ({
	visible,
	workerConnected,
	workerId,
	workerWorkspace,
	onClose,
	resolvedTheme,
}: WorkerInfoModalProps) => {
	const isDark = resolvedTheme === "dark";
	const { requestWorkerJoinToken } = useAuth();
	const [joinToken, setJoinToken] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!visible) {
			setJoinToken(null);
			setError(null);
			setIsGenerating(false);
		}
	}, [visible]);

	const handleGenerateToken = async () => {
		setIsGenerating(true);
		setError(null);
		try {
			const token = await requestWorkerJoinToken();
			if (!token) {
				throw new Error("Failed to create join token");
			}
			setJoinToken(token);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setError(error.message || "Failed to create join token");
		} finally {
			setIsGenerating(false);
		}
	};

	const handleCopyToken = async () => {
		if (joinToken) {
			await Clipboard.setStringAsync(joinToken);
		}
	};

	return (
		<Modal visible={visible} transparent animationType="fade">
			<TouchableOpacity
				style={styles.modalOverlay}
				activeOpacity={1}
				onPress={onClose}
			>
				<View style={[styles.modalContent, isDark && styles.modalContentDark]}>
					<Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
						Worker Info
					</Text>
					<View style={[styles.modalRow, isDark && styles.modalRowDark]}>
						<Text style={[styles.modalLabel, isDark && styles.modalLabelDark]}>
							Status
						</Text>
						<Text style={[styles.modalValue, isDark && styles.modalValueDark]}>
							{workerConnected ? "Connected" : "Disconnected"}
						</Text>
					</View>
					{workerId && (
						<View style={[styles.modalRow, isDark && styles.modalRowDark]}>
							<Text
								style={[styles.modalLabel, isDark && styles.modalLabelDark]}
							>
								ID
							</Text>
							<Text
								style={[styles.modalValue, isDark && styles.modalValueDark]}
							>
								{workerId}
							</Text>
						</View>
					)}
					{workerWorkspace?.path && (
						<View style={[styles.modalRow, isDark && styles.modalRowDark]}>
							<Text
								style={[styles.modalLabel, isDark && styles.modalLabelDark]}
							>
								Path
							</Text>
							<Text
								style={[styles.modalValue, isDark && styles.modalValueDark]}
								numberOfLines={2}
							>
								{workerWorkspace.path}
							</Text>
						</View>
					)}
					<View style={styles.tokenSection}>
						<Text style={[styles.modalLabel, isDark && styles.modalLabelDark]}>
							Add Worker
						</Text>
						{joinToken ? (
							<>
								<Text
									style={[styles.tokenValue, isDark && styles.tokenValueDark]}
									numberOfLines={3}
								>
									{joinToken}
								</Text>
								<Text
									style={[styles.helperText, isDark && styles.helperTextDark]}
								>
									Run: myworker join --token {joinToken}
								</Text>
								<TouchableOpacity
									style={[styles.modalButton, isDark && styles.modalButtonDark]}
									onPress={handleCopyToken}
								>
									<Text
										style={[
											styles.modalButtonText,
											isDark && styles.modalButtonTextDark,
										]}
									>
										Copy Join Token
									</Text>
								</TouchableOpacity>
							</>
						) : (
							<TouchableOpacity
								style={[styles.modalButton, isDark && styles.modalButtonDark]}
								onPress={handleGenerateToken}
								disabled={isGenerating}
							>
								<Text
									style={[
										styles.modalButtonText,
										isDark && styles.modalButtonTextDark,
									]}
								>
									{isGenerating ? "Generating..." : "Generate Join Token"}
								</Text>
							</TouchableOpacity>
						)}
						{error && (
							<Text style={[styles.errorText, isDark && styles.errorTextDark]}>
								{error}
							</Text>
						)}
					</View>
					<TouchableOpacity
						style={[styles.modalClose, isDark && styles.modalCloseDark]}
						onPress={onClose}
					>
						<Text
							style={[
								styles.modalCloseText,
								isDark && styles.modalCloseTextDark,
							]}
						>
							Close
						</Text>
					</TouchableOpacity>
				</View>
			</TouchableOpacity>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.4)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalContent: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 24,
		width: "85%",
		maxWidth: 340,
	},
	modalContentDark: {
		backgroundColor: "#1a1a1a",
	},
	modalTitle: {
		color: "#000",
		fontSize: 18,
		fontWeight: "600",
		marginBottom: 20,
	},
	modalTitleDark: {
		color: "#f5f5f5",
	},
	modalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
	},
	modalRowDark: {
		borderBottomColor: "#2a2a2a",
	},
	modalLabel: {
		color: "#666",
		fontSize: 14,
	},
	modalLabelDark: {
		color: "#bdbdbd",
	},
	modalValue: {
		color: "#000",
		fontSize: 14,
		flexShrink: 1,
		textAlign: "right",
	},
	modalValueDark: {
		color: "#f5f5f5",
	},
	tokenSection: {
		marginTop: 16,
		gap: 8,
	},
	tokenValue: {
		color: "#000",
		fontSize: 13,
	},
	tokenValueDark: {
		color: "#f5f5f5",
	},
	modalButton: {
		marginTop: 4,
		alignItems: "center",
		paddingVertical: 10,
		backgroundColor: "#111",
		borderRadius: 8,
	},
	modalButtonDark: {
		backgroundColor: "#f5f5f5",
	},
	modalButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	modalButtonTextDark: {
		color: "#111",
	},
	errorText: {
		color: "#c62828",
		fontSize: 12,
	},
	errorTextDark: {
		color: "#ff6b6b",
	},
	helperText: {
		color: "#555",
		fontSize: 12,
	},
	helperTextDark: {
		color: "#9c9c9c",
	},
	modalClose: {
		marginTop: 24,
		alignItems: "center",
		paddingVertical: 14,
		backgroundColor: "#f5f5f5",
		borderRadius: 8,
	},
	modalCloseDark: {
		backgroundColor: "#111",
	},
	modalCloseText: {
		color: "#333",
		fontSize: 16,
		fontWeight: "500",
	},
	modalCloseTextDark: {
		color: "#f5f5f5",
	},
});
