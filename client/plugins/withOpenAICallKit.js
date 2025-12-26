/**
 * Expo Config Plugin for OpenAI CallKit integration
 *
 * This plugin configures the iOS project for CallKit audio functionality:
 * - Adds microphone usage description to Info.plist
 * - Enables audio background mode for call continuation
 * - Adds native Swift/ObjC files to the Xcode project
 *
 * Usage in app.json or app.config.js:
 *   "plugins": [
 *     "./plugins/withOpenAICallKit"
 *   ]
 */

const {
	withInfoPlist,
	withXcodeProject,
	withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Configures Info.plist for CallKit audio requirements
 */
function withCallKitInfoPlist(config) {
	return withInfoPlist(config, (config) => {
		// Add microphone usage description (required for audio recording)
		if (!config.modResults.NSMicrophoneUsageDescription) {
			config.modResults.NSMicrophoneUsageDescription =
				"Bigwig needs microphone access for voice conversations with the AI assistant";
		}

		// Add background modes for CallKit
		const existingModes = config.modResults.UIBackgroundModes || [];
		const requiredModes = ["audio", "voip"];
		const newModes = [...existingModes];
		for (const mode of requiredModes) {
			if (!newModes.includes(mode)) {
				newModes.push(mode);
			}
		}
		config.modResults.UIBackgroundModes = newModes;

		return config;
	});
}

/**
 * Copy native module files from plugins source to ios project
 */
function withCallKitNativeFiles(config) {
	return withDangerousMod(config, [
		"ios",
		async (config) => {
			const projectRoot = config.modRequest.projectRoot;
			const platformProjectRoot = config.modRequest.platformProjectRoot;

			// Source files are in the plugins directory for persistence
			const sourceDir = path.join(
				projectRoot,
				"plugins",
				"OpenAICallKit-native",
			);

			// Find the actual app directory (could be Bigwig, BigwigDev, etc.)
			const possibleDirs = fs.readdirSync(platformProjectRoot).filter((d) => {
				const fullPath = path.join(platformProjectRoot, d);
				return (
					fs.statSync(fullPath).isDirectory() &&
					d.startsWith("Bigwig") &&
					!d.includes(".")
				);
			});
			const appDir = possibleDirs[0] || "Bigwig";

			const targetDir = path.join(platformProjectRoot, appDir, "OpenAICallKit");

			// Create target directory if it doesn't exist
			if (!fs.existsSync(targetDir)) {
				fs.mkdirSync(targetDir, { recursive: true });
			}

			// Copy files if source directory exists
			if (fs.existsSync(sourceDir)) {
				const files = fs.readdirSync(sourceDir);
				for (const file of files) {
					const sourcePath = path.join(sourceDir, file);
					const targetPath = path.join(targetDir, file);
					fs.copyFileSync(sourcePath, targetPath);
					console.log(`[withOpenAICallKit] Copied ${file} to ${targetDir}`);
				}
			} else {
				console.log(
					`[withOpenAICallKit] Source directory not found: ${sourceDir}`,
				);
				console.log(
					"[withOpenAICallKit] Native files should be in plugins/OpenAICallKit-native/",
				);
			}

			return config;
		},
	]);
}

/**
 * Add native files to Xcode project
 */
function withCallKitXcodeProject(config) {
	return withXcodeProject(config, async (config) => {
		const xcodeProject = config.modResults;
		const projectName = config.modRequest.projectName || "Bigwig";
		const platformProjectRoot = config.modRequest.platformProjectRoot;

		// Find or create the OpenAICallKit group
		const targetDir = path.join(
			platformProjectRoot,
			projectName,
			"OpenAICallKit",
		);

		if (!fs.existsSync(targetDir)) {
			console.log("[withOpenAICallKit] OpenAICallKit directory not found");
			return config;
		}

		// Add source files using just the filename (files are already in the right directory)
		const files = fs.readdirSync(targetDir);
		const target = xcodeProject.getFirstTarget().uuid;

		// Find the main app group
		const _mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
		const groups = xcodeProject.hash.project.objects.PBXGroup;

		// Find existing Bigwig group
		let appGroup = null;
		for (const key in groups) {
			if (
				groups[key].name === projectName ||
				groups[key].path === projectName
			) {
				appGroup = key;
				break;
			}
		}

		for (const file of files) {
			// Use path relative to project root (ios folder)
			// Files are in ios/Bigwig/OpenAICallKit/
			const relativePath = `${projectName}/OpenAICallKit/${file}`;

			if (file.endsWith(".swift") || file.endsWith(".m")) {
				// Check if file already exists in project
				const existingFile = xcodeProject.hasFile(relativePath);
				if (!existingFile) {
					xcodeProject.addSourceFile(
						relativePath,
						{ target: target },
						appGroup,
					);
					console.log(`[withOpenAICallKit] Added ${file} to Xcode project`);
				}
			} else if (file.endsWith(".h")) {
				const existingFile = xcodeProject.hasFile(relativePath);
				if (!existingFile) {
					xcodeProject.addHeaderFile(relativePath, { public: true }, appGroup);
					console.log(`[withOpenAICallKit] Added ${file} to Xcode project`);
				}
			}
		}

		return config;
	});
}

/**
 * Main config plugin that applies all CallKit-related modifications
 */
function withOpenAICallKit(config) {
	// Apply Info.plist modifications
	config = withCallKitInfoPlist(config);

	// Copy native files
	config = withCallKitNativeFiles(config);

	// Add files to Xcode project
	config = withCallKitXcodeProject(config);

	return config;
}

module.exports = withOpenAICallKit;
