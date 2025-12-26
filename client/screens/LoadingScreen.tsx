import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { ThemeMode } from "../theme/theme";

type LoadingScreenProps = {
	resolvedTheme: ThemeMode;
};

export const LoadingScreen = ({ resolvedTheme }: LoadingScreenProps) => {
	const styles = useMemo(() => {
		const isDark = resolvedTheme === "dark";
		return StyleSheet.create({
			container: {
				flex: 1,
				backgroundColor: isDark ? "#0f0f0f" : "#fff",
			},
			centered: {
				flex: 1,
				justifyContent: "center",
				alignItems: "center",
				padding: 24,
			},
		});
	}, [resolvedTheme]);

	const statusBarStyle = resolvedTheme === "dark" ? "light" : "dark";
	const spinnerColor = resolvedTheme === "dark" ? "#f5f5f5" : "#333";

	return (
		<View style={styles.container}>
			<StatusBar style={statusBarStyle} />
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={spinnerColor} />
			</View>
		</View>
	);
};
