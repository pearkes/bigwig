/**
 * Form Modal Component
 *
 * Modal wrapper for displaying dynamic forms from form_request events.
 */

import { BlurView } from "expo-blur";
import { useState } from "react";
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import type { ThemeMode } from "../../theme/theme";
import type { FormSchema, FormValues } from "../../types/forms";
import { DynamicForm } from "./DynamicForm";

// =============================================================================
// Types
// =============================================================================

export interface FormRequestEvent {
	type: "form_request";
	id: string;
	ts: number;
	task_id?: string;
	prompt?: string;
	form: FormSchema;
	timeout_seconds?: number;
}

interface FormModalProps {
	request: FormRequestEvent | null;
	onSubmit: (requestId: string, values: FormValues, taskId?: string) => void;
	onCancel: (requestId: string, taskId?: string) => void;
	onDismiss?: () => void;
	resolvedTheme: ThemeMode;
}

// =============================================================================
// Component
// =============================================================================

export const FormModal = ({
	request,
	onSubmit,
	onCancel,
	onDismiss,
	resolvedTheme,
}: FormModalProps) => {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isDark = resolvedTheme === "dark";

	if (!request) return null;

	// Debug: log request on render (only when we have a request)
	console.log("[FormModal] === FORM REQUEST DEBUG ===");
	console.log("[FormModal] request.id:", request.id);
	console.log("[FormModal] request.form:", request.form);
	console.log("[FormModal] request.form?.fields:", request.form?.fields);
	console.log("[FormModal] typeof request.form:", typeof request.form);
	if (request.form) {
		console.log(
			"[FormModal] Object.keys(request.form):",
			Object.keys(request.form),
		);
	}
	console.log("[FormModal] === END DEBUG ===");

	const handleSubmit = (values: FormValues) => {
		setIsSubmitting(true);
		onSubmit(request.id, values, request.task_id);
	};

	const handleCancel = () => {
		setIsSubmitting(true);
		onCancel(request.id, request.task_id);
	};

	return (
		<Modal visible={true} transparent animationType="fade">
			<BlurView intensity={20} style={styles.overlay}>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.container}
				>
					<View style={[styles.modal, isDark && styles.modalDark]}>
						{/* Dismiss button to minimize */}
						{onDismiss && (
							<TouchableOpacity
								style={[
									styles.dismissButton,
									isDark && styles.dismissButtonDark,
								]}
								onPress={onDismiss}
							>
								<Text
									style={[styles.dismissText, isDark && styles.dismissTextDark]}
								>
									✕
								</Text>
							</TouchableOpacity>
						)}

						{request.prompt && (
							<Text style={[styles.prompt, isDark && styles.promptDark]}>
								{request.prompt}
							</Text>
						)}

						<DynamicForm
							schema={request.form}
							onSubmit={handleSubmit}
							onCancel={handleCancel}
							isSubmitting={isSubmitting}
							resolvedTheme={resolvedTheme}
						/>
					</View>
				</KeyboardAvoidingView>
			</BlurView>
		</Modal>
	);
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.3)",
	},
	container: {
		width: "100%",
		maxHeight: "85%",
		alignItems: "center",
		paddingHorizontal: 20,
	},
	modal: {
		backgroundColor: "#fff",
		borderRadius: 16,
		padding: 24,
		width: "100%",
		maxWidth: 400,
		maxHeight: "100%",
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
		fontSize: 15,
		color: "#666",
		marginBottom: 16,
		textAlign: "center",
		lineHeight: 22,
	},
	promptDark: {
		color: "#bdbdbd",
	},
	dismissButton: {
		position: "absolute",
		top: 12,
		right: 12,
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: "#f0f0f0",
		alignItems: "center",
		justifyContent: "center",
		zIndex: 10,
	},
	dismissButtonDark: {
		backgroundColor: "#111",
	},
	dismissText: {
		fontSize: 14,
		color: "#666",
		fontWeight: "600",
	},
	dismissTextDark: {
		color: "#f5f5f5",
	},
});
