import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ThemeMode, ThemePreference } from "../../theme/theme";

type SettingsModalProps = {
	visible: boolean;
	onClose: () => void;
	onLogout?: () => void;
	includeLiveMuteToggle?: boolean;
	isMuted?: boolean;
	onToggleMute?: () => void;
	muteMicByDefault: boolean;
	onToggleMuteMicByDefault: () => void;
	autoStartVoice: boolean;
	onToggleAutoStartVoice: () => void;
	showTranscript: boolean;
	onToggleShowTranscript: () => void;
	themePreference: ThemePreference;
	resolvedTheme: ThemeMode;
	onSetThemePreference: (preference: ThemePreference) => void;
};

export const SettingsModal = ({
	visible,
	onClose,
	onLogout,
	includeLiveMuteToggle = false,
	isMuted,
	onToggleMute,
	muteMicByDefault,
	onToggleMuteMicByDefault,
	autoStartVoice,
	onToggleAutoStartVoice,
	showTranscript,
	onToggleShowTranscript,
	themePreference,
	resolvedTheme,
	onSetThemePreference,
}: SettingsModalProps) => (
	<Modal visible={visible} transparent animationType="fade">
		{(() => {
			const isDark = resolvedTheme === "dark";
			return (
				<TouchableOpacity
					style={styles.modalOverlay}
					activeOpacity={1}
					onPress={onClose}
				>
					<TouchableOpacity
						activeOpacity={1}
						style={[styles.modalContent, isDark && styles.modalContentDark]}
					>
						<Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
							Settings
						</Text>
						<View
							style={[
								styles.settingsRow,
								styles.settingsRowStack,
								isDark && styles.settingsRowDark,
							]}
						>
							<Text
								style={[
									styles.settingsLabel,
									isDark && styles.settingsLabelDark,
								]}
							>
								Appearance
							</Text>
							<View
								style={[
									styles.segmentedControl,
									isDark && styles.segmentedControlDark,
								]}
							>
								{(["system", "light", "dark"] as ThemePreference[]).map(
									(option) => {
										const isActive = themePreference === option;
										return (
											<TouchableOpacity
												key={option}
												style={[
													styles.segmentButton,
													isActive && styles.segmentButtonActive,
													isDark && styles.segmentButtonDark,
													isDark && isActive && styles.segmentButtonActiveDark,
												]}
												onPress={() => onSetThemePreference(option)}
											>
												<Text
													style={[
														styles.segmentText,
														isActive && styles.segmentTextActive,
														isDark && styles.segmentTextDark,
														isDark && isActive && styles.segmentTextActiveDark,
													]}
												>
													{option === "system"
														? "System"
														: option === "light"
															? "Light"
															: "Dark"}
												</Text>
											</TouchableOpacity>
										);
									},
								)}
							</View>
						</View>
						{includeLiveMuteToggle &&
							typeof isMuted === "boolean" &&
							onToggleMute && (
								<View style={styles.settingsRow}>
									<Text
										style={[
											styles.settingsLabel,
											isDark && styles.settingsLabelDark,
										]}
									>
										Mute microphone
									</Text>
									<TouchableOpacity
										style={[
											styles.toggle,
											isMuted && styles.toggleActive,
											isDark && styles.toggleDark,
											isDark && isMuted && styles.toggleActiveDark,
										]}
										onPress={onToggleMute}
									>
										<View
											style={[
												styles.toggleKnob,
												isMuted && styles.toggleKnobActive,
												isDark && styles.toggleKnobDark,
											]}
										/>
									</TouchableOpacity>
								</View>
							)}
						<View
							style={[styles.settingsRow, isDark && styles.settingsRowDark]}
						>
							<Text
								style={[
									styles.settingsLabel,
									isDark && styles.settingsLabelDark,
								]}
							>
								Mute mic by default
							</Text>
							<TouchableOpacity
								style={[
									styles.toggle,
									muteMicByDefault && styles.toggleActive,
									isDark && styles.toggleDark,
									isDark && muteMicByDefault && styles.toggleActiveDark,
								]}
								onPress={onToggleMuteMicByDefault}
							>
								<View
									style={[
										styles.toggleKnob,
										muteMicByDefault && styles.toggleKnobActive,
										isDark && styles.toggleKnobDark,
									]}
								/>
							</TouchableOpacity>
						</View>
						<View
							style={[styles.settingsRow, isDark && styles.settingsRowDark]}
						>
							<Text
								style={[
									styles.settingsLabel,
									isDark && styles.settingsLabelDark,
								]}
							>
								Auto-start on open
							</Text>
							<TouchableOpacity
								style={[
									styles.toggle,
									autoStartVoice && styles.toggleActive,
									isDark && styles.toggleDark,
									isDark && autoStartVoice && styles.toggleActiveDark,
								]}
								onPress={onToggleAutoStartVoice}
							>
								<View
									style={[
										styles.toggleKnob,
										autoStartVoice && styles.toggleKnobActive,
										isDark && styles.toggleKnobDark,
									]}
								/>
							</TouchableOpacity>
						</View>
						<View
							style={[styles.settingsRow, isDark && styles.settingsRowDark]}
						>
							<Text
								style={[
									styles.settingsLabel,
									isDark && styles.settingsLabelDark,
								]}
							>
								Show transcript
							</Text>
							<TouchableOpacity
								style={[
									styles.toggle,
									showTranscript && styles.toggleActive,
									isDark && styles.toggleDark,
									isDark && showTranscript && styles.toggleActiveDark,
								]}
								onPress={onToggleShowTranscript}
							>
								<View
									style={[
										styles.toggleKnob,
										showTranscript && styles.toggleKnobActive,
										isDark && styles.toggleKnobDark,
									]}
								/>
							</TouchableOpacity>
						</View>
						{onLogout && (
							<TouchableOpacity
								style={[styles.logoutButton, isDark && styles.logoutButtonDark]}
								onPress={onLogout}
							>
								<Text
									style={[styles.logoutText, isDark && styles.logoutTextDark]}
								>
									Log out
								</Text>
							</TouchableOpacity>
						)}
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
					</TouchableOpacity>
				</TouchableOpacity>
			);
		})()}
	</Modal>
);

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
	settingsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
	},
	settingsRowDark: {
		borderBottomColor: "#2a2a2a",
	},
	settingsRowStack: {
		alignItems: "flex-start",
		flexDirection: "column",
		gap: 12,
	},
	settingsLabel: {
		color: "#000",
		fontSize: 15,
	},
	settingsLabelDark: {
		color: "#f5f5f5",
	},
	segmentedControl: {
		flexDirection: "row",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#ddd",
		overflow: "hidden",
		alignSelf: "stretch",
	},
	segmentedControlDark: {
		borderColor: "#2a2a2a",
	},
	segmentButton: {
		flex: 1,
		paddingVertical: 10,
		alignItems: "center",
		backgroundColor: "#f5f5f5",
	},
	segmentButtonDark: {
		backgroundColor: "#111",
	},
	segmentButtonActive: {
		backgroundColor: "#000",
	},
	segmentButtonActiveDark: {
		backgroundColor: "#f5f5f5",
	},
	segmentText: {
		color: "#333",
		fontSize: 13,
		fontWeight: "600",
	},
	segmentTextDark: {
		color: "#bdbdbd",
	},
	segmentTextActive: {
		color: "#fff",
	},
	segmentTextActiveDark: {
		color: "#111",
	},
	toggle: {
		width: 50,
		height: 28,
		borderRadius: 14,
		backgroundColor: "#ddd",
		justifyContent: "center",
		paddingHorizontal: 2,
	},
	toggleActive: {
		backgroundColor: "#000",
	},
	toggleDark: {
		backgroundColor: "#2a2a2a",
	},
	toggleActiveDark: {
		backgroundColor: "#f5f5f5",
	},
	toggleKnob: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "#fff",
	},
	toggleKnobDark: {
		backgroundColor: "#111",
	},
	toggleKnobActive: {
		alignSelf: "flex-end",
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
	logoutButton: {
		marginTop: 20,
		alignItems: "center",
		paddingVertical: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#d32f2f",
	},
	logoutButtonDark: {
		borderColor: "#ff6b6b",
	},
	logoutText: {
		color: "#d32f2f",
		fontSize: 15,
		fontWeight: "600",
	},
	logoutTextDark: {
		color: "#ff6b6b",
	},
});
