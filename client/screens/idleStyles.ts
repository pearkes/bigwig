import { Platform, StyleSheet } from "react-native";
import type { ThemeMode } from "../theme/theme";

export const getIdleStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		background: isDark ? "#0f0f0f" : "#f5f5f5",
		card: isDark ? "#1a1a1a" : "#fff",
		title: isDark ? "#f5f5f5" : "#111",
		subtitle: isDark ? "#bdbdbd" : "#555",
		body: isDark ? "#bdbdbd" : "#666",
		label: isDark ? "#9c9c9c" : "#777",
		primaryButton: isDark ? "#f5f5f5" : "#111",
		primaryButtonText: isDark ? "#111" : "#fff",
		secondaryButton: isDark ? "#2a2a2a" : "#efefef",
		secondaryButtonText: isDark ? "#f5f5f5" : "#333",
		iconButton: isDark ? "#2a2a2a" : "#efefef",
		helper: isDark ? "#bdbdbd" : "#666",
		logoutLink: isDark ? "#9c9c9c" : "#666",
		regenerate: isDark ? "#bdbdbd" : "#666",
		backLink: isDark ? "#bdbdbd" : "#666",
		codeBg: isDark ? "#111" : "#f5f5f5",
		codeBorder: isDark ? "#2a2a2a" : "#ddd",
		codeText: isDark ? "#f5f5f5" : "#333",
		error: isDark ? "#ff6b6b" : "#c62828",
	};

	return StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: colors.background,
		},
		centered: {
			flex: 1,
			justifyContent: "center",
			alignItems: "center",
			padding: 24,
		},
		header: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
			paddingTop: 60,
			paddingHorizontal: 20,
			paddingBottom: 16,
			zIndex: 100,
			backgroundColor: "transparent",
		},
		card: {
			width: "100%",
			maxWidth: 360,
			backgroundColor: colors.card,
			borderRadius: 16,
			padding: 20,
			gap: 12,
		},
		cardTaller: {
			paddingBottom: 28,
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
		bodyText: {
			fontSize: 13,
			color: colors.body,
			lineHeight: 18,
		},
		label: {
			fontSize: 13,
			color: colors.label,
			marginTop: 6,
		},
		primaryButton: {
			marginTop: 8,
			backgroundColor: colors.primaryButton,
			paddingVertical: 12,
			borderRadius: 10,
			alignItems: "center",
		},
		primaryButtonText: {
			color: colors.primaryButtonText,
			fontWeight: "600",
			fontSize: 16,
		},
		secondaryButton: {
			backgroundColor: colors.secondaryButton,
			paddingVertical: 10,
			borderRadius: 10,
			alignItems: "center",
			justifyContent: "center",
			flex: 1,
			width: "100%",
			minHeight: 44,
		},
		secondaryButtonText: {
			color: colors.secondaryButtonText,
			fontWeight: "600",
			fontSize: 14,
			textAlign: "center",
			lineHeight: 18,
		},
		actionRow: {
			marginTop: 4,
			flexDirection: "row",
			alignItems: "stretch",
			gap: 10,
		},
		copiedRow: {
			flexDirection: "row",
			alignItems: "center",
			gap: 8,
		},
		iconButton: {
			width: 42,
			height: 42,
			borderRadius: 10,
			backgroundColor: colors.iconButton,
			alignItems: "center",
			justifyContent: "center",
		},
		helperText: {
			color: colors.helper,
			fontSize: 12,
			lineHeight: 16,
			marginTop: 2,
			paddingBottom: 4,
			includeFontPadding: false,
		},
		logoutFooter: {
			position: "absolute",
			bottom: 40,
			left: 24,
			right: 24,
			alignItems: "center",
			gap: 10,
		},
		logoutLink: {
			color: colors.logoutLink,
			fontSize: 13,
			fontWeight: "500",
		},
		regenerateButton: {
			paddingHorizontal: 12,
			paddingVertical: 6,
		},
		regenerateText: {
			color: colors.regenerate,
			fontSize: 13,
			fontWeight: "500",
		},
		backLink: {
			color: colors.backLink,
			fontSize: 13,
			fontWeight: "500",
		},
		errorText: {
			color: colors.error,
			marginBottom: 12,
			textAlign: "center",
		},
		codeBlock: {
			backgroundColor: colors.codeBg,
			borderRadius: 10,
			paddingHorizontal: 12,
			paddingVertical: 12,
			borderWidth: 1,
			borderColor: colors.codeBorder,
		},
		codeText: {
			fontSize: 13,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
			color: colors.codeText,
		},
		btnDisabled: {
			opacity: 0.4,
		},
		loadingRow: {
			flexDirection: "row",
			alignItems: "center",
		},
		loadingText: {
			marginLeft: 8,
			marginTop: 0,
			alignSelf: "center",
		},
	});
};
