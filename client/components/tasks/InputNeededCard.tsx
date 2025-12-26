import { memo, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, Layout } from "react-native-reanimated";
import type { ThemeMode } from "../../theme/theme";
import type { PendingInputRequest } from "../../types/ui";

type InputNeededCardProps = {
	pendingRequest: PendingInputRequest;
	onPress: () => void;
	resolvedTheme: ThemeMode;
};

export const InputNeededCard = memo(
	({ pendingRequest, onPress, resolvedTheme }: InputNeededCardProps) => {
		const styles = useMemo(
			() => getInputNeededCardStyles(resolvedTheme),
			[resolvedTheme],
		);
		const getPromptText = () => {
			switch (pendingRequest.kind) {
				case "input":
					return pendingRequest.request.prompt;
				case "form":
					return (
						pendingRequest.request.form?.title ||
						pendingRequest.request.prompt ||
						"Form required"
					);
				case "file":
					return pendingRequest.request.prompt;
			}
		};

		const getIcon = () => {
			switch (pendingRequest.kind) {
				case "input":
					return "✏️";
				case "form":
					return "📋";
				case "file":
					return "📎";
			}
		};

		return (
			<TouchableOpacity onPress={onPress} activeOpacity={0.7}>
				<Animated.View
					style={styles.inputNeededCard}
					entering={FadeIn.duration(200)}
					layout={Layout.duration(300)}
				>
					<View style={styles.inputNeededHeader}>
						<Text style={styles.inputNeededIcon}>{getIcon()}</Text>
						<Text style={styles.inputNeededTitle} numberOfLines={1}>
							{getPromptText()}
						</Text>
					</View>
					<View style={styles.inputNeededButton}>
						<Text style={styles.inputNeededButtonText}>Input needed</Text>
					</View>
				</Animated.View>
			</TouchableOpacity>
		);
	},
);

const getInputNeededCardStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		cardBg: isDark ? "rgba(255, 184, 0, 0.12)" : "#FFF9E6",
		cardBorder: "#FFB800",
		title: isDark ? "#f5f5f5" : "#333",
		buttonBg: "#FFB800",
		buttonText: isDark ? "#111" : "#fff",
	};

	return StyleSheet.create({
		inputNeededCard: {
			padding: 14,
			borderRadius: 16,
			backgroundColor: colors.cardBg,
			borderWidth: 2,
			borderColor: colors.cardBorder,
			marginBottom: 8,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
		},
		inputNeededHeader: {
			flexDirection: "row",
			alignItems: "center",
			flex: 1,
			gap: 8,
		},
		inputNeededIcon: {
			fontSize: 16,
		},
		inputNeededTitle: {
			flex: 1,
			fontSize: 14,
			fontWeight: "500",
			color: colors.title,
		},
		inputNeededButton: {
			backgroundColor: colors.buttonBg,
			paddingHorizontal: 12,
			paddingVertical: 6,
			borderRadius: 12,
		},
		inputNeededButtonText: {
			color: colors.buttonText,
			fontSize: 12,
			fontWeight: "600",
		},
	});
};
