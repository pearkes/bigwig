import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

type SoundKey = "taskStart" | "inputRequired" | "taskFinished";

const SOUND_ASSETS: Record<SoundKey, number> = {
	taskStart: require("../assets/sound/start.m4a"),
	inputRequired: require("../assets/sound/input_required.m4a"),
	taskFinished: require("../assets/sound/finished.m4a"),
};

const players: Partial<Record<SoundKey, ReturnType<typeof createAudioPlayer>>> =
	{};
let audioConfigured = false;

const ensureAudioMode = async () => {
	if (audioConfigured) return;
	audioConfigured = true;
	try {
		await setAudioModeAsync({
			playsInSilentMode: true,
			allowsRecording: true,
			interruptionMode: "mixWithOthers",
			interruptionModeAndroid: "duckOthers",
			shouldPlayInBackground: true,
			shouldRouteThroughEarpiece: false,
		});
	} catch (error) {
		console.warn("[sound] Failed to set audio mode:", error);
	}
};

const ensurePlayer = (key: SoundKey) => {
	if (!players[key]) {
		players[key] = createAudioPlayer(SOUND_ASSETS[key], {
			keepAudioSessionActive: true,
		});
	}
	return players[key]!;
};

const playSound = async (key: SoundKey) => {
	try {
		await ensureAudioMode();
		const player = ensurePlayer(key);
		await player.seekTo(0).catch(() => {});
		player.play();
	} catch (error) {
		console.warn(`[sound] Failed to play ${key}:`, error);
	}
};

export const playTaskStartSound = () => {
	void playSound("taskStart");
};

export const playInputRequiredSound = () => {
	void playSound("inputRequired");
};

export const playTaskFinishedSound = () => {
	void playSound("taskFinished");
};
