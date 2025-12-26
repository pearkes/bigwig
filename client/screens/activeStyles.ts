import { Dimensions, Platform, StyleSheet } from "react-native";
import type { ThemeMode } from "../theme/theme";

export const getMarkdownStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		text: isDark ? "#f5f5f5" : "#000",
		muted: isDark ? "#bdbdbd" : "#666",
		codeBg: isDark ? "#1a1a1a" : "#f0f0f0",
		fenceBg: isDark ? "#141414" : "#f5f5f5",
		blockquoteBg: isDark ? "#151515" : "#f8f8f8",
		blockquoteBorder: isDark ? "#333" : "#ccc",
		link: isDark ? "#4da3ff" : "#007AFF",
	};

	return StyleSheet.create({
		body: {
			color: colors.text,
			fontSize: 15,
			lineHeight: 24,
		},
		paragraph: {
			marginTop: 10,
			marginBottom: 10,
			flexWrap: "wrap",
			flexDirection: "row",
			alignItems: "flex-start",
			justifyContent: "flex-start",
			width: "100%",
		},
		heading1: {
			fontSize: 24,
			fontWeight: "700",
			marginTop: 16,
			marginBottom: 8,
			flexDirection: "row",
		},
		heading2: {
			fontSize: 20,
			fontWeight: "600",
			marginTop: 14,
			marginBottom: 6,
			flexDirection: "row",
		},
		heading3: {
			fontSize: 17,
			fontWeight: "600",
			marginTop: 12,
			marginBottom: 4,
			flexDirection: "row",
		},
		code_inline: {
			backgroundColor: colors.codeBg,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
			fontSize: 13,
			paddingHorizontal: 4,
			borderRadius: 3,
		},
		fence: {
			backgroundColor: colors.fenceBg,
			padding: 12,
			borderRadius: 6,
			marginVertical: 10,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
			fontSize: 13,
		},
		list_item: {
			flexDirection: "row",
			justifyContent: "flex-start",
			marginVertical: 2,
		},
		bullet_list: {
			marginTop: 8,
			marginBottom: 8,
		},
		ordered_list: {
			marginTop: 8,
			marginBottom: 8,
		},
		bullet_list_icon: {
			marginLeft: 10,
			marginRight: 10,
		},
		bullet_list_content: {
			flex: 1,
		},
		ordered_list_icon: {
			marginLeft: 10,
			marginRight: 10,
		},
		ordered_list_content: {
			flex: 1,
		},
		blockquote: {
			backgroundColor: colors.blockquoteBg,
			borderLeftWidth: 3,
			borderLeftColor: colors.blockquoteBorder,
			paddingLeft: 12,
			marginVertical: 10,
		},
		link: {
			color: colors.link,
		},
	});
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const getActiveStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		background: isDark ? "#0f0f0f" : "#fff",
		mutedText: isDark ? "#bdbdbd" : "#666",
		headingText: isDark ? "#f5f5f5" : "#000",
		subText: isDark ? "#9c9c9c" : "#333",
		inputText: isDark ? "#f5f5f5" : "#000",
		inputPlaceholder: isDark ? "#9c9c9c" : "#999",
		inputBg: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(120, 120, 128, 0.08)",
		inputContainer: isDark
			? "rgba(15, 15, 15, 0.85)"
			: "rgba(255, 255, 255, 0.65)",
		inputBorder: isDark
			? "rgba(255, 255, 255, 0.08)"
			: "rgba(255, 255, 255, 0.5)",
		surface: isDark ? "rgba(20, 20, 20, 0.9)" : "rgba(255, 255, 255, 0.9)",
		taskModalBg: isDark ? "#111" : "#fff",
		taskModalBorder: isDark
			? "rgba(255, 255, 255, 0.08)"
			: "rgba(0, 0, 0, 0.1)",
		taskModalDivider: isDark ? "#2a2a2a" : "#eee",
		taskModalSection: isDark ? "#1a1a1a" : "#f5f5f5",
		toolName: isDark ? "#4da3ff" : "#007AFF",
		toolInput: isDark ? "#9c9c9c" : "#666",
		taskResult: isDark ? "#e0e0e0" : "#333",
		statusText: isDark ? "#f5f5f5" : "#333",
		userTranscript: isDark ? "#8c8c8c" : "#666",
		muteIcon: isDark ? "#f5f5f5" : "#333",
		mutedIcon: isDark ? "#ff6b6b" : "#e53935",
		speakerIcon: isDark ? "#7fb7ff" : "#2196F3",
		sendBtn: isDark ? "#4da3ff" : "#007AFF",
		sendBtnDisabled: isDark
			? "rgba(255, 255, 255, 0.16)"
			: "rgba(120, 120, 128, 0.16)",
	};

	return StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: colors.background,
		},
		containerInner: {
			flex: 1,
			backgroundColor: "transparent",
		},
		vignetteLeft: {
			position: "absolute",
			top: 0,
			bottom: 0,
			left: 0,
			width: SCREEN_WIDTH * 0.25,
		},
		vignetteRight: {
			position: "absolute",
			top: 0,
			bottom: 0,
			right: 0,
			width: SCREEN_WIDTH * 0.25,
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
		audioControls: {
			flexDirection: "row",
			gap: 8,
		},
		muteButton: {
			width: 36,
			height: 36,
			borderRadius: 18,
			backgroundColor: colors.surface,
			justifyContent: "center",
			alignItems: "center",
			shadowColor: "#000",
			shadowOffset: { width: 0, height: 2 },
			shadowOpacity: 0.1,
			shadowRadius: 4,
			elevation: 3,
		},
		muteButtonActive: {
			backgroundColor: isDark
				? "rgba(255, 107, 107, 0.15)"
				: "rgba(229, 57, 53, 0.1)",
		},
		speakerButtonActive: {
			backgroundColor: isDark
				? "rgba(127, 183, 255, 0.15)"
				: "rgba(33, 150, 243, 0.1)",
		},
		taskCardsContainer: {
			flex: 1,
			zIndex: 1,
			backgroundColor: "transparent",
		},
		taskCardsContent: {
			flexGrow: 1,
			justifyContent: "flex-end",
			paddingHorizontal: 16,
			paddingTop: 100,
			paddingBottom: 8,
			gap: 12,
			backgroundColor: "transparent",
		},
		agentTranscriptRow: {
			paddingVertical: 6,
			paddingHorizontal: 16,
			alignItems: "flex-start",
		},
		agentTranscriptText: {
			fontSize: 14,
			color: colors.statusText,
			textAlign: "left",
		},
		userTranscriptRow: {
			paddingVertical: 6,
			paddingHorizontal: 16,
			alignItems: "flex-end",
		},
		userTranscriptText: {
			fontSize: 14,
			color: colors.userTranscript,
			fontStyle: "italic",
			textAlign: "right",
		},
		inputArea: {
			marginHorizontal: 16,
			paddingHorizontal: 12,
			paddingVertical: 12,
			backgroundColor: colors.inputContainer,
			borderRadius: 28,
			borderWidth: 1,
			borderColor: colors.inputBorder,
			shadowColor: "#000",
			shadowOffset: { width: 0, height: 4 },
			shadowOpacity: 0.12,
			shadowRadius: 20,
			elevation: 8,
			zIndex: 1,
		},
		inputRow: {
			flexDirection: "row",
			alignItems: "center",
			gap: 8,
		},
		textInput: {
			flex: 1,
			backgroundColor: colors.inputBg,
			borderRadius: 22,
			paddingHorizontal: 18,
			paddingVertical: 14,
			color: colors.inputText,
			fontSize: 17,
			borderWidth: 0,
		},
		sendBtn: {
			width: 32,
			height: 32,
			borderRadius: 16,
			backgroundColor: colors.sendBtn,
			justifyContent: "center",
			alignItems: "center",
		},
		sendBtnDisabled: {
			backgroundColor: colors.sendBtnDisabled,
		},
		sendArrow: {
			color: "#fff",
			fontSize: 16,
			fontWeight: "600",
			marginTop: -1,
		},
		taskModalOverlay: {
			flex: 1,
		},
		taskModalDismissArea: {
			flex: 1,
		},
		taskModalContent: {
			backgroundColor: colors.taskModalBg,
			borderTopLeftRadius: 0,
			borderTopRightRadius: 0,
			borderTopWidth: 1,
			borderTopColor: colors.taskModalBorder,
			maxHeight: "75%",
			paddingBottom: 34,
		},
		taskModalHeader: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingHorizontal: 20,
			paddingTop: 20,
			paddingBottom: 12,
			borderBottomWidth: 1,
			borderBottomColor: colors.taskModalDivider,
		},
		taskModalTitleRow: {
			flexDirection: "row",
			alignItems: "center",
			gap: 10,
			flex: 1,
		},
		taskModalTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: colors.headingText,
			flex: 1,
		},
		taskModalCloseBtn: {
			fontSize: 20,
			color: colors.mutedText,
			padding: 4,
		},
		taskModalMeta: {
			paddingHorizontal: 20,
			paddingVertical: 8,
		},
		taskModalMetaText: {
			fontSize: 13,
			color: colors.mutedText,
		},
		taskModalScroll: {
			flexGrow: 1,
			flexShrink: 1,
		},
		taskModalScrollContent: {
			paddingHorizontal: 20,
			paddingBottom: 20,
			flexGrow: 1,
		},
		taskModalSection: {
			marginBottom: 20,
		},
		taskModalSectionTitle: {
			fontSize: 12,
			fontWeight: "600",
			color: colors.mutedText,
			textTransform: "uppercase",
			letterSpacing: 0.5,
			marginBottom: 8,
		},
		taskModalToolRow: {
			backgroundColor: colors.taskModalSection,
			borderRadius: 8,
			padding: 10,
			marginBottom: 6,
		},
		taskModalToolName: {
			fontSize: 13,
			fontWeight: "500",
			color: colors.toolName,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
		},
		taskModalToolInput: {
			fontSize: 12,
			color: colors.toolInput,
			marginTop: 4,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
		},
		taskModalResultText: {
			fontSize: 14,
			color: colors.taskResult,
			lineHeight: 20,
		},
		taskCardCheck: {
			color: "#4CAF50",
			fontSize: 14,
			fontWeight: "600",
		},
		mutedIcon: {
			color: colors.mutedIcon,
		},
		speakerIcon: {
			color: colors.speakerIcon,
		},
		muteIcon: {
			color: colors.muteIcon,
		},
	});
};
