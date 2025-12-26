import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Modal,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import type { ThemeMode } from "../theme/theme";
import type { FileRequestEvent } from "../types/tasks";

interface FileRequestModalProps {
	request: FileRequestEvent | null;
	onUpload: (
		requestId: string,
		fileId: string,
		name: string,
		mime: string,
		size: number,
		chunks: string[],
		taskId?: string,
	) => void;
	onCancel: (requestId: string, taskId?: string) => void;
	resolvedTheme: ThemeMode;
}

type ModalState = "initial" | "uploading" | "error";

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

export const FileRequestModal = ({
	request,
	onUpload,
	onCancel,
	resolvedTheme,
}: FileRequestModalProps) => {
	const [state, setState] = useState<ModalState>("initial");
	const [error, setError] = useState<string | null>(null);
	const [uploadProgress, setUploadProgress] = useState(0);
	const cancelledRef = useRef(false);
	const isDark = resolvedTheme === "dark";
	const actionIconColor = isDark ? "#7fb7ff" : "#007AFF";

	const processFile = useCallback(
		async (asset: ImagePicker.ImagePickerAsset) => {
			if (!request) return;
			setState("uploading");
			setUploadProgress(0);

			try {
				console.log("[FileRequest] Processing asset:", {
					uri: asset.uri,
					fileName: asset.fileName,
					mimeType: asset.mimeType,
					hasBase64: !!asset.base64,
					base64Length: asset.base64?.length,
				});

				const name = asset.fileName || `photo_${Date.now()}.jpg`;
				const mime = asset.mimeType || "image/jpeg";

				// Use base64 from picker if available, otherwise read from filesystem
				let base64 = asset.base64;
				if (!base64 && asset.uri) {
					console.log("[FileRequest] Reading base64 from filesystem...");
					base64 = await FileSystem.readAsStringAsync(asset.uri, {
						encoding: "base64",
					});
				}

				if (!base64) {
					throw new Error("Failed to get base64 data");
				}

				console.log("[FileRequest] Got base64, length:", base64.length);

				// Calculate size (base64 decodes to ~75% of string length)
				const size = Math.floor(base64.length * 0.75);

				// Split into chunks
				const chunks: string[] = [];
				for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
					chunks.push(base64.slice(i, i + CHUNK_SIZE));
				}

				const fileId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

				// Simulate progress for UX (with cancellation check)
				for (let i = 0; i <= chunks.length; i++) {
					if (cancelledRef.current) return;
					setUploadProgress(Math.floor((i / chunks.length) * 100));
					await new Promise((r) => setTimeout(r, 50));
				}

				if (cancelledRef.current) return;
				onUpload(request.id, fileId, name, mime, size, chunks, request.task_id);
			} catch (err) {
				if (cancelledRef.current) return;
				setError(`Failed to process file: ${err}`);
				setState("error");
			}
		},
		[onUpload, request],
	);

	const handlePickImage = useCallback(async () => {
		try {
			const permission =
				await ImagePicker.requestMediaLibraryPermissionsAsync();
			if (!permission.granted) {
				setError("Photo library access denied");
				setState("error");
				return;
			}

			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ["images"],
				quality: 0.8,
				allowsEditing: false,
				base64: true, // Get base64 directly from picker
			});

			console.log("[FileRequest] Library result:", {
				canceled: result.canceled,
				assetCount: result.assets?.length,
			});

			if (!result.canceled && result.assets && result.assets[0]) {
				await processFile(result.assets[0]);
			} else if (!result.canceled) {
				setError("No photo selected");
				setState("error");
			}
		} catch (err) {
			setError(`Failed to pick image: ${err}`);
			setState("error");
		}
	}, [processFile]);

	const handleTakePhoto = useCallback(async () => {
		try {
			const permission = await ImagePicker.requestCameraPermissionsAsync();
			if (!permission.granted) {
				setError("Camera access denied");
				setState("error");
				return;
			}

			const result = await ImagePicker.launchCameraAsync({
				quality: 0.8,
				allowsEditing: false,
				base64: true, // Get base64 directly from picker
			});

			console.log("[FileRequest] Camera result:", {
				canceled: result.canceled,
				assetCount: result.assets?.length,
			});

			if (!result.canceled && result.assets && result.assets[0]) {
				await processFile(result.assets[0]);
			} else if (!result.canceled) {
				setError("No photo captured");
				setState("error");
			}
		} catch (err) {
			setError(`Failed to take photo: ${err}`);
			setState("error");
		}
	}, [processFile]);

	useEffect(() => {
		if (request) {
			cancelledRef.current = false;
			setState("initial");
			setError(null);
			setUploadProgress(0);

			// Auto-open camera if requested
			if (request.open_camera) {
				handleTakePhoto();
			}
		}
		return () => {
			cancelledRef.current = true;
		};
	}, [request, handleTakePhoto]);

	const handleCancel = () => {
		if (!request) return;
		if (request.required && state !== "error") {
			return; // Can't cancel required requests unless error
		}
		onCancel(request.id, request.task_id);
	};

	const handleRetry = () => {
		setState("initial");
		setError(null);
	};

	if (!request) return null;

	const showCamera = request.open_camera || request.file_type === "photo";
	const showLibrary = request.file_type !== "photo";

	return (
		<Modal visible={true} transparent animationType="fade">
			<BlurView intensity={20} style={styles.overlay}>
				<View style={[styles.modal, isDark && styles.modalDark]}>
					<Text style={[styles.prompt, isDark && styles.promptDark]}>
						{request.prompt}
					</Text>

					{state === "initial" && (
						<View style={styles.buttonsContainer}>
							{showLibrary && (
								<TouchableOpacity
									style={[
										styles.actionButton,
										isDark && styles.actionButtonDark,
									]}
									onPress={handlePickImage}
									activeOpacity={0.7}
								>
									<Ionicons
										name="images-outline"
										size={24}
										color={actionIconColor}
									/>
									<Text
										style={[
											styles.actionButtonText,
											isDark && styles.actionButtonTextDark,
										]}
									>
										Choose Photo
									</Text>
								</TouchableOpacity>
							)}

							{showCamera && (
								<TouchableOpacity
									style={[
										styles.actionButton,
										isDark && styles.actionButtonDark,
									]}
									onPress={handleTakePhoto}
									activeOpacity={0.7}
								>
									<Ionicons
										name="camera-outline"
										size={24}
										color={actionIconColor}
									/>
									<Text
										style={[
											styles.actionButtonText,
											isDark && styles.actionButtonTextDark,
										]}
									>
										Take Photo
									</Text>
								</TouchableOpacity>
							)}
						</View>
					)}

					{state === "uploading" && (
						<View style={styles.uploadingContainer}>
							<ActivityIndicator size="large" color={actionIconColor} />
							<Text
								style={[
									styles.uploadingText,
									isDark && styles.uploadingTextDark,
								]}
							>
								Uploading... {uploadProgress}%
							</Text>
						</View>
					)}

					{state === "error" && (
						<View style={styles.errorContainer}>
							<Ionicons name="alert-circle-outline" size={32} color="#FF3B30" />
							<Text style={[styles.errorText, isDark && styles.errorTextDark]}>
								{error}
							</Text>
							<TouchableOpacity
								style={[styles.retryButton, isDark && styles.retryButtonDark]}
								onPress={handleRetry}
								activeOpacity={0.7}
							>
								<Text
									style={[
										styles.retryButtonText,
										isDark && styles.retryButtonTextDark,
									]}
								>
									Try Again
								</Text>
							</TouchableOpacity>
						</View>
					)}

					{(!request.required || state === "error") &&
						state !== "uploading" && (
							<TouchableOpacity
								style={styles.cancelButton}
								onPress={handleCancel}
								activeOpacity={0.7}
							>
								<Text
									style={[styles.cancelText, isDark && styles.cancelTextDark]}
								>
									Cancel
								</Text>
							</TouchableOpacity>
						)}

					<Text style={[styles.privacyNote, isDark && styles.privacyNoteDark]}>
						File will be shared with the assistant
					</Text>
				</View>
			</BlurView>
		</Modal>
	);
};

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.3)",
	},
	modal: {
		backgroundColor: "#fff",
		borderRadius: 16,
		padding: 24,
		width: "90%",
		maxWidth: 340,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.15,
		shadowRadius: 24,
		elevation: 12,
	},
	modalDark: {
		backgroundColor: "#1a1a1a",
	},
	prompt: {
		fontSize: 17,
		fontWeight: "600",
		color: "#000",
		marginBottom: 20,
		textAlign: "center",
		lineHeight: 24,
	},
	promptDark: {
		color: "#f5f5f5",
	},
	buttonsContainer: {
		gap: 12,
		marginBottom: 16,
	},
	actionButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		backgroundColor: "#f5f5f5",
		borderRadius: 12,
		paddingVertical: 16,
		paddingHorizontal: 20,
		borderWidth: 1,
		borderColor: "rgba(0, 0, 0, 0.06)",
	},
	actionButtonDark: {
		backgroundColor: "#111",
		borderColor: "rgba(255, 255, 255, 0.12)",
	},
	actionButtonText: {
		fontSize: 16,
		fontWeight: "500",
		color: "#007AFF",
	},
	actionButtonTextDark: {
		color: "#7fb7ff",
	},
	uploadingContainer: {
		alignItems: "center",
		paddingVertical: 24,
		gap: 12,
	},
	uploadingText: {
		fontSize: 15,
		color: "#666",
	},
	uploadingTextDark: {
		color: "#bdbdbd",
	},
	errorContainer: {
		alignItems: "center",
		paddingVertical: 16,
		gap: 8,
	},
	errorText: {
		fontSize: 14,
		color: "#FF3B30",
		textAlign: "center",
	},
	errorTextDark: {
		color: "#ff6b6b",
	},
	retryButton: {
		marginTop: 8,
		paddingVertical: 10,
		paddingHorizontal: 20,
		backgroundColor: "#007AFF",
		borderRadius: 8,
	},
	retryButtonDark: {
		backgroundColor: "#7fb7ff",
	},
	retryButtonText: {
		fontSize: 15,
		fontWeight: "600",
		color: "#fff",
	},
	retryButtonTextDark: {
		color: "#111",
	},
	cancelButton: {
		paddingVertical: 10,
		alignItems: "center",
	},
	cancelText: {
		fontSize: 15,
		color: "#666",
	},
	cancelTextDark: {
		color: "#bdbdbd",
	},
	privacyNote: {
		fontSize: 12,
		color: "#999",
		textAlign: "center",
		marginTop: 8,
	},
	privacyNoteDark: {
		color: "#9c9c9c",
	},
});
