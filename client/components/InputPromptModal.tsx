import { BlurView } from "expo-blur";
import { useEffect, useState } from "react";
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import type { ThemeMode } from "../theme/theme";
import type { InputRequestEvent } from "../types/tasks";

interface InputPromptModalProps {
	request: InputRequestEvent | null;
	onSubmit: (requestId: string, value: string, taskId?: string) => void;
	onCancel: (requestId: string, taskId?: string) => void;
	resolvedTheme: ThemeMode;
}

export const InputPromptModal = ({
	request,
	onSubmit,
	onCancel,
	resolvedTheme,
}: InputPromptModalProps) => {
	const [value, setValue] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isDark = resolvedTheme === "dark";
	const placeholderTextColor = isDark ? "#9c9c9c" : "#999";

	useEffect(() => {
		if (request) {
			setValue(request.default || "");
			setIsSubmitting(false);
		}
	}, [request]);

	if (!request) return null;

	const inputType = request.input_type || "text";

	const handleSubmit = () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		onSubmit(request.id, value, request.task_id);
		setValue("");
	};

	const handleCancel = () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		onCancel(request.id, request.task_id);
		setValue("");
	};

	const handleSelectOption = (option: string) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		onSubmit(request.id, option, request.task_id);
		setValue("");
	};

	const handleConfirm = (confirmed: boolean) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		onSubmit(request.id, confirmed ? "yes" : "no", request.task_id);
		setValue("");
	};

	return (
		<Modal visible={true} transparent animationType="fade">
			<BlurView intensity={20} style={styles.overlay}>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.container}
				>
					<View style={[styles.modal, isDark && styles.modalDark]}>
						<Text style={[styles.prompt, isDark && styles.promptDark]}>
							{request.prompt}
						</Text>

						{inputType === "select" && request.options ? (
							<View
								style={[
									styles.optionsContainer,
									isSubmitting && styles.disabled,
								]}
							>
								{request.options.map((option, index) => (
									<TouchableOpacity
										key={index}
										style={[
											styles.optionButton,
											isSubmitting && styles.optionButtonDisabled,
											isDark && styles.optionButtonDark,
										]}
										onPress={() => handleSelectOption(option)}
										activeOpacity={0.7}
										disabled={isSubmitting}
									>
										<Text
											style={[
												styles.optionText,
												isSubmitting && styles.optionTextDisabled,
												isDark && styles.optionTextDark,
											]}
										>
											{option}
										</Text>
									</TouchableOpacity>
								))}
							</View>
						) : inputType === "confirm" ? (
							<View style={styles.confirmContainer}>
								<TouchableOpacity
									style={[
										styles.confirmButton,
										styles.confirmYes,
										isSubmitting && styles.confirmButtonDisabled,
									]}
									onPress={() => handleConfirm(true)}
									activeOpacity={0.7}
									disabled={isSubmitting}
								>
									<Text
										style={[
											styles.confirmYesText,
											isSubmitting && styles.confirmTextDisabled,
										]}
									>
										Yes
									</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={[
										styles.confirmButton,
										styles.confirmNo,
										isSubmitting && styles.confirmButtonDisabled,
										isDark && styles.confirmNoDark,
									]}
									onPress={() => handleConfirm(false)}
									activeOpacity={0.7}
									disabled={isSubmitting}
								>
									<Text
										style={[
											styles.confirmNoText,
											isSubmitting && styles.confirmTextDisabled,
											isDark && styles.confirmNoTextDark,
										]}
									>
										No
									</Text>
								</TouchableOpacity>
							</View>
						) : (
							<>
								<TextInput
									style={[styles.textInput, isDark && styles.textInputDark]}
									value={value}
									onChangeText={setValue}
									placeholder="Type your answer..."
									placeholderTextColor={placeholderTextColor}
									autoFocus
									returnKeyType="done"
									onSubmitEditing={handleSubmit}
									editable={!isSubmitting}
								/>
								<TouchableOpacity
									style={[
										styles.submitButton,
										(!value.trim() || isSubmitting) &&
											styles.submitButtonDisabled,
									]}
									onPress={handleSubmit}
									disabled={!value.trim() || isSubmitting}
									activeOpacity={0.7}
								>
									<Text
										style={[
											styles.submitText,
											(!value.trim() || isSubmitting) &&
												styles.submitTextDisabled,
										]}
									>
										{isSubmitting ? "Sending..." : "Submit"}
									</Text>
								</TouchableOpacity>
							</>
						)}

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
					</View>
				</KeyboardAvoidingView>
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
	container: {
		width: "100%",
		alignItems: "center",
		paddingHorizontal: 24,
	},
	modal: {
		backgroundColor: "#fff",
		borderRadius: 16,
		padding: 24,
		width: "100%",
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
	textInput: {
		backgroundColor: "#f5f5f5",
		borderRadius: 12,
		paddingHorizontal: 16,
		paddingVertical: 14,
		fontSize: 16,
		color: "#000",
		marginBottom: 12,
		borderWidth: 1,
		borderColor: "rgba(0, 0, 0, 0.06)",
	},
	textInputDark: {
		backgroundColor: "#111",
		color: "#f5f5f5",
		borderColor: "rgba(255, 255, 255, 0.12)",
	},
	submitButton: {
		backgroundColor: "#007AFF",
		borderRadius: 12,
		paddingVertical: 14,
		alignItems: "center",
		marginBottom: 12,
	},
	submitButtonDisabled: {
		backgroundColor: "#e0e0e0",
	},
	submitText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
	},
	submitTextDisabled: {
		color: "#999",
	},
	optionsContainer: {
		marginBottom: 12,
		gap: 8,
	},
	optionButton: {
		backgroundColor: "#f5f5f5",
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 16,
		borderWidth: 1,
		borderColor: "rgba(0, 0, 0, 0.06)",
	},
	optionButtonDark: {
		backgroundColor: "#111",
		borderColor: "rgba(255, 255, 255, 0.12)",
	},
	optionText: {
		fontSize: 16,
		color: "#000",
		textAlign: "center",
	},
	optionTextDark: {
		color: "#f5f5f5",
	},
	confirmContainer: {
		flexDirection: "row",
		gap: 12,
		marginBottom: 12,
	},
	confirmButton: {
		flex: 1,
		borderRadius: 12,
		paddingVertical: 14,
		alignItems: "center",
	},
	confirmYes: {
		backgroundColor: "#007AFF",
	},
	confirmNo: {
		backgroundColor: "#f5f5f5",
		borderWidth: 1,
		borderColor: "rgba(0, 0, 0, 0.06)",
	},
	confirmNoDark: {
		backgroundColor: "#111",
		borderColor: "rgba(255, 255, 255, 0.12)",
	},
	confirmYesText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
	},
	confirmNoText: {
		fontSize: 16,
		fontWeight: "500",
		color: "#333",
	},
	confirmNoTextDark: {
		color: "#f5f5f5",
	},
	confirmButtonDisabled: {
		opacity: 0.5,
	},
	confirmTextDisabled: {
		opacity: 0.7,
	},
	disabled: {
		opacity: 0.6,
	},
	optionButtonDisabled: {
		backgroundColor: "#e8e8e8",
	},
	optionTextDisabled: {
		color: "#999",
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
});
