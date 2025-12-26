# OpenAI CallKit Plugin

This document describes the native files required for the OpenAI CallKit integration.

## Config Plugin

The `withOpenAICallKit.js` config plugin automatically configures:

- **NSMicrophoneUsageDescription** - Required for audio recording
- **UIBackgroundModes: ["audio"]** - Allows audio to continue in background

### Registration

Add to `app.json` or `app.config.js`:

```json
{
  "expo": {
    "plugins": [
      "./plugins/withOpenAICallKit"
    ]
  }
}
```

Then run:

```bash
npx expo prebuild --clean
```

## Native Files (Manual Setup)

The following files in `ios/OpenAICallKit/` must be added to the Xcode project manually or preserved across prebuilds:

### Required Files

| File | Purpose |
|------|---------|
| `OpenAICallKit.h` | Umbrella header for the module |
| `OpenAICallKit-Bridging-Header.h` | Bridging header for React Native integration |
| `OpenAICallKitModule.swift` | Main native module exposing React Native bridge |
| `CallKitManager.swift` | CallKit CXProvider and CXCallController management |
| `AudioSessionManager.swift` | AVAudioSession configuration for calls |

### Adding to Xcode Project

1. Open `ios/Bigwig.xcworkspace` in Xcode
2. Right-click on the project navigator → "Add Files to Bigwig"
3. Select the `OpenAICallKit` folder
4. Ensure "Create groups" is selected
5. Ensure the target "Bigwig" is checked

### Build Settings

In Xcode project settings, ensure:

- **Swift Language Version**: 5.0+
- **Objective-C Bridging Header**: `$(SRCROOT)/OpenAICallKit/OpenAICallKit-Bridging-Header.h`

## Background Modes Note

This POC uses only the `audio` background mode, not `voip`:

- ✅ `audio` - Sufficient for outbound calls and maintaining audio during backgrounding
- ❌ `voip` - Not needed since we don't receive incoming calls via PushKit

If you later need incoming call support, add `voip` to UIBackgroundModes and implement PushKit integration.
