export type ThemeMode = "light" | "dark";
export type ThemePreference = "system" | ThemeMode;

export const resolveTheme = (
	preference: ThemePreference,
	systemScheme: ThemeMode | null,
): ThemeMode => {
	if (preference !== "system") {
		return preference;
	}
	return systemScheme ?? "light";
};
