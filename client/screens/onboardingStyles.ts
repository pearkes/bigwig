import { StyleSheet } from "react-native";
import type { ThemeMode } from "../theme/theme";

export const getOnboardingStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		background: isDark ? "#0f0f0f" : "#f5f5f5",
		card: isDark ? "#1a1a1a" : "#fff",
		title: isDark ? "#f5f5f5" : "#111",
		subtitle: isDark ? "#bdbdbd" : "#555",
		label: isDark ? "#9c9c9c" : "#777",
		value: isDark ? "#f5f5f5" : "#111",
		matchCode: isDark ? "#f5f5f5" : "#111",
		inputBg: isDark ? "#111" : "#fff",
		inputText: isDark ? "#f5f5f5" : "#111",
		inputBorder: isDark ? "#2a2a2a" : "#ddd",
		primaryButton: isDark ? "#f5f5f5" : "#111",
		primaryButtonText: isDark ? "#111" : "#fff",
		secondaryButton: isDark ? "#2a2a2a" : "#efefef",
		secondaryButtonText: isDark ? "#f5f5f5" : "#333",
		helperText: isDark ? "#bdbdbd" : "#666",
		logoutText: isDark ? "#bdbdbd" : "#666",
		errorText: isDark ? "#ff6b6b" : "#c62828",
		scanOverlay: isDark ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.5)",
		scanBorder: isDark ? "#f5f5f5" : "#111",
	};

	return StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: colors.background,
			justifyContent: "center",
			alignItems: "center",
			padding: 24,
		},
		card: {
			width: "100%",
			maxWidth: 360,
			backgroundColor: colors.card,
			borderRadius: 16,
			padding: 20,
			gap: 12,
		},
		title: {
			fontSize: 22,
			fontWeight: "700",
			color: colors.title,
		},
		subtitle: {
			fontSize: 14,
			color: colors.subtitle,
		},
		label: {
			fontSize: 13,
			color: colors.label,
			marginTop: 6,
		},
		value: {
			color: colors.value,
			fontSize: 14,
		},
		matchCode: {
			fontSize: 28,
			letterSpacing: 2,
			color: colors.matchCode,
			fontWeight: "700",
		},
		input: {
			width: "100%",
			borderRadius: 10,
			paddingHorizontal: 12,
			paddingVertical: 10,
			backgroundColor: colors.inputBg,
			color: colors.inputText,
			borderWidth: 1,
			borderColor: colors.inputBorder,
		},
		primaryButton: {
			marginTop: 8,
			backgroundColor: colors.primaryButton,
			paddingVertical: 12,
			borderRadius: 10,
			alignItems: "center",
		},
		primaryButtonDisabled: {
			opacity: 0.5,
		},
		primaryButtonText: {
			color: colors.primaryButtonText,
			fontWeight: "600",
			fontSize: 16,
		},
		secondaryButton: {
			marginTop: 4,
			backgroundColor: colors.secondaryButton,
			paddingVertical: 12,
			borderRadius: 10,
			alignItems: "center",
		},
		secondaryButtonText: {
			color: colors.secondaryButtonText,
			fontWeight: "600",
			fontSize: 14,
		},
		helperText: {
			color: colors.helperText,
			fontSize: 12,
			marginTop: 8,
		},
		logoutButton: {
			marginTop: 16,
		},
		logoutButtonText: {
			color: colors.logoutText,
			fontSize: 13,
			fontWeight: "500",
		},
		errorText: {
			color: colors.errorText,
			marginBottom: 12,
			textAlign: "center",
		},
		scanOverlay: {
			flex: 1,
			backgroundColor: colors.scanOverlay,
			alignItems: "center",
			justifyContent: "center",
			padding: 24,
		},
		scanWindow: {
			width: 260,
			height: 260,
			borderRadius: 12,
			overflow: "hidden",
			borderWidth: 2,
			borderColor: colors.scanBorder,
		},
		camera: {
			width: "100%",
			height: "100%",
		},
	});
};
