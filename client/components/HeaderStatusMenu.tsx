import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type HeaderStatusMenuItem = {
	label: string;
	onPress: () => void;
	variant?: "danger";
	isLast?: boolean;
};

type HeaderStatusMenuProps = {
	label: string;
	dotColor: string;
	showDropdown: boolean;
	onToggle: () => void;
	items: HeaderStatusMenuItem[];
	disabled?: boolean;
	variant?: "dark";
};

export const HeaderStatusMenu = ({
	label,
	dotColor,
	showDropdown,
	onToggle,
	items,
	disabled = false,
	variant,
}: HeaderStatusMenuProps) => (
	<View style={[styles.container, disabled && styles.containerDisabled]}>
		<TouchableOpacity
			style={styles.statusButton}
			onPress={onToggle}
			disabled={disabled}
		>
			<View style={[styles.statusDot, { backgroundColor: dotColor }]} />
			<Text
				style={[styles.statusText, variant === "dark" && styles.statusTextDark]}
			>
				{label}
			</Text>
			<Text
				style={[
					styles.dropdownArrow,
					variant === "dark" && styles.dropdownArrowDark,
				]}
			>
				▼
			</Text>
		</TouchableOpacity>

		{showDropdown && (
			<View
				style={[styles.dropdown, variant === "dark" && styles.dropdownDark]}
			>
				{items.map((item, index) => (
					<TouchableOpacity
						key={`${item.label}-${index}`}
						style={[
							styles.dropdownItem,
							(item.isLast || index === items.length - 1) &&
								styles.dropdownItemLast,
							variant === "dark" && styles.dropdownItemDark,
						]}
						onPress={item.onPress}
					>
						<Text
							style={[
								styles.dropdownItemText,
								item.variant === "danger" && styles.dropdownItemTextDanger,
								variant === "dark" && styles.dropdownItemTextDark,
								item.variant === "danger" &&
									variant === "dark" &&
									styles.dropdownItemTextDangerDark,
							]}
						>
							{item.label}
						</Text>
					</TouchableOpacity>
				))}
			</View>
		)}
	</View>
);

const styles = StyleSheet.create({
	container: {
		position: "relative",
	},
	containerDisabled: {
		opacity: 0.5,
	},
	statusButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	statusDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	statusText: {
		color: "#333",
		fontSize: 15,
		fontWeight: "500",
	},
	statusTextDark: {
		color: "#f5f5f5",
	},
	dropdownArrow: {
		color: "#999",
		fontSize: 10,
		marginLeft: 4,
	},
	dropdownArrowDark: {
		color: "#bdbdbd",
	},
	dropdown: {
		position: "absolute",
		top: 32,
		left: 0,
		backgroundColor: "#fff",
		borderRadius: 8,
		minWidth: 160,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 8,
		zIndex: 1000,
		borderWidth: 1,
		borderColor: "#eee",
	},
	dropdownDark: {
		backgroundColor: "#1a1a1a",
		borderColor: "#2a2a2a",
	},
	dropdownItem: {
		paddingVertical: 14,
		paddingHorizontal: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
	},
	dropdownItemDark: {
		borderBottomColor: "#2a2a2a",
	},
	dropdownItemLast: {
		borderBottomWidth: 0,
	},
	dropdownItemText: {
		color: "#333",
		fontSize: 15,
	},
	dropdownItemTextDark: {
		color: "#f5f5f5",
	},
	dropdownItemTextDanger: {
		color: "#d32f2f",
	},
	dropdownItemTextDangerDark: {
		color: "#ff6b6b",
	},
});
