const IS_PROD = process.env.APP_ENV === "production";

export default {
	expo: {
		name: IS_PROD ? "Bigwig" : "Bigwig Dev",
		scheme: "bigwig",
		slug: "bigwig",
		owner: "bigwig-b",
		platforms: ["ios"],
		version: "1.0.0",
		orientation: "portrait",
		icon: "./assets/icon.png",
		userInterfaceStyle: "automatic",
		newArchEnabled: true,
		splash: {
			image: "./assets/splash-icon.png",
			resizeMode: "contain",
			backgroundColor: "#1a1a2e",
		},
		ios: {
			supportsTablet: true,
			infoPlist: {
				NSMicrophoneUsageDescription:
					"Bigwig needs microphone access for voice commands",
				NSCameraUsageDescription:
					"Bigwig uses the camera to scan pairing QR codes",
				ITSAppUsesNonExemptEncryption: false,
			},
			bundleIdentifier: IS_PROD
				? "com.pearkes.bigwig"
				: "com.pearkes.bigwig.dev",
			buildNumber: "2",
		},
		web: {
			favicon: "./assets/favicon.png",
			bundler: "metro",
		},
		plugins: [
			[
				"expo-build-properties",
				{
					ios: {
						useFrameworks: "static",
					},
				},
			],
			"expo-audio",
			"expo-camera",
			"./plugins/withOpenAICallKit",
		],
		extra: {
			eas: {
				projectId: "344bbbfc-9590-401b-8b17-0ef5f81d843f",
			},
		},
	},
};
