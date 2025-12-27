import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { Appearance } from "react-native";
import type { AppSettings, ServerInfo } from "../services/storageService";
import {
	clearServerInfo as clearServerInfoStorage,
	getServerInfo,
	getSettings,
	setSettings,
	setServerInfo as storeServerInfo,
} from "../services/storageService";
import type { ThemeMode, ThemePreference } from "../theme/theme";
import { resolveTheme } from "../theme/theme";

type SettingsContextValue = {
	serverUrl: string | null;
	serverFingerprint: string | null;
	autoStartVoice: boolean;
	muteMicByDefault: boolean;
	showTranscript: boolean;
	themePreference: ThemePreference;
	resolvedTheme: ThemeMode;
	debugLogsEnabled: boolean;
	setServerInfo: (info: ServerInfo) => void;
	clearServerInfo: () => void;
	toggleAutoStartVoice: () => void;
	toggleMuteMicByDefault: () => void;
	toggleShowTranscript: () => void;
	toggleDebugLogsEnabled: () => void;
	setThemePreference: (preference: ThemePreference) => void;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(
	undefined,
);

export const SettingsProvider = ({
	children,
}: {
	children: React.ReactNode;
}) => {
	const [autoStartVoice, setAutoStartVoice] = useState(false);
	const [muteMicByDefault, setMuteMicByDefault] = useState(true);
	const [showTranscript, setShowTranscript] = useState(true);
	const [debugLogsEnabled, setDebugLogsEnabled] = useState(false);
	const [themePreference, setThemePreferenceState] =
		useState<ThemePreference>("system");
	const [serverUrl, setServerUrl] = useState<string | null>(null);
	const [serverFingerprint, setServerFingerprint] = useState<string | null>(
		null,
	);
	const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());
	const resolvedTheme = resolveTheme(themePreference, systemScheme);

	useEffect(() => {
		const load = async () => {
			const settings = await getSettings();
			const server = await getServerInfo();
			if (settings) {
				setAutoStartVoice(settings.autoStartVoice ?? false);
				setMuteMicByDefault(settings.muteMicByDefault ?? true);
				setShowTranscript(settings.showTranscript ?? true);
				setThemePreferenceState(settings.themePreference ?? "system");
				setDebugLogsEnabled(settings.debugLogsEnabled ?? false);
			}
			if (server) {
				setServerUrl(server.url);
				setServerFingerprint(server.fingerprint);
			}
		};
		load();
	}, []);

	useEffect(() => {
		const subscription = Appearance.addChangeListener(({ colorScheme }) => {
			setSystemScheme(colorScheme);
		});
		return () => subscription.remove();
	}, []);

	const updateSettings = async (newSettings: Partial<AppSettings>) => {
		await setSettings(newSettings);
	};

	const toggleAutoStartVoice = () => {
		const newValue = !autoStartVoice;
		setAutoStartVoice(newValue);
		updateSettings({ autoStartVoice: newValue });
	};

	const toggleMuteMicByDefault = () => {
		const newValue = !muteMicByDefault;
		setMuteMicByDefault(newValue);
		updateSettings({ muteMicByDefault: newValue });
	};

	const toggleShowTranscript = () => {
		const newValue = !showTranscript;
		setShowTranscript(newValue);
		updateSettings({ showTranscript: newValue });
	};

	const toggleDebugLogsEnabled = () => {
		const newValue = !debugLogsEnabled;
		setDebugLogsEnabled(newValue);
		updateSettings({ debugLogsEnabled: newValue });
	};

	const setThemePreference = (preference: ThemePreference) => {
		setThemePreferenceState(preference);
		updateSettings({ themePreference: preference });
	};

	const updateServerInfo = (info: ServerInfo) => {
		setServerUrl(info.url);
		setServerFingerprint(info.fingerprint);
		storeServerInfo(info);
	};

	const clearServerInfo = () => {
		setServerUrl(null);
		setServerFingerprint(null);
		clearServerInfoStorage();
	};

	const value: SettingsContextValue = {
		serverUrl,
		serverFingerprint,
		autoStartVoice,
		muteMicByDefault,
		showTranscript,
		themePreference,
		resolvedTheme,
		debugLogsEnabled,
		setServerInfo: updateServerInfo,
		clearServerInfo,
		toggleAutoStartVoice,
		toggleMuteMicByDefault,
		toggleShowTranscript,
		toggleDebugLogsEnabled,
		setThemePreference,
	};

	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	);
};

export const useSettings = () => {
	const context = useContext(SettingsContext);
	if (!context) {
		throw new Error("useSettings must be used within a SettingsProvider");
	}
	return context;
};
