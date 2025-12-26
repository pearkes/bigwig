/**
 * Types for the OpenAI CallKit native module.
 * Provides TypeScript definitions for voice calls using OpenAI Realtime API + CallKit.
 */

/** Call state matching the native iOS implementation */
export enum CallState {
	Idle = "idle",
	Starting = "starting",
	Connecting = "connecting",
	Connected = "connected",
	Ending = "ending",
	Ended = "ended",
	Failed = "failed",
}

/** Configuration for OpenAI Realtime API connection */
export interface SessionConfig {
	/** OpenAI API key or ephemeral token */
	apiKey: string;
	/** Model to use (e.g., "gpt-realtime") */
	model: string;
	/** Voice for the assistant */
	voice?:
		| "alloy"
		| "ash"
		| "ballad"
		| "coral"
		| "echo"
		| "sage"
		| "shimmer"
		| "verse";
	/** System instructions */
	instructions?: string;
	/** Modalities to enable */
	modalities?: ("text" | "audio")[];
	/** Turn detection configuration */
	turnDetection?: TurnDetectionConfig | null;
	/** Input audio format */
	inputAudioFormat?: "pcm16" | "g711_ulaw" | "g711_alaw";
	/** Output audio format */
	outputAudioFormat?: "pcm16" | "g711_ulaw" | "g711_alaw";
	/** Input audio transcription config */
	inputAudioTranscription?: {
		model?: string;
	} | null;
	/** Temperature for responses */
	temperature?: number;
	/** Max output tokens */
	maxOutputTokens?: number | "inf";
	/** Tools available to the model */
	tools?: OpenAITool[];
}

/** Server VAD turn detection configuration */
export interface TurnDetectionConfig {
	type: "server_vad";
	threshold?: number;
	prefixPaddingMs?: number;
	silenceDurationMs?: number;
	createResponse?: boolean;
}

/** Tool definition for OpenAI Realtime */
export interface OpenAITool {
	type: "function";
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

/** Event payloads from native module */
export interface CallStateChangeEvent {
	state: CallState;
	callId?: string;
}

export interface CallErrorEvent {
	code: string;
	message: string;
	recoverable?: boolean;
}

/** Call ID event from OpenAI */
export interface CallIdEvent {
	callId: string;
}

/** Callback types for event listeners */
export type CallStateCallback = (event: CallStateChangeEvent) => void;
export type ErrorCallback = (event: CallErrorEvent) => void;
export type CallIdCallback = (event: CallIdEvent) => void;
export type WebRTCEventCallback = (event: Record<string, unknown>) => void;

/** Hook return type */
export interface UseOpenAICallReturn {
	callState: CallState;
	isMuted: boolean;
	isSpeakerEnabled: boolean;
	error: CallErrorEvent | null;
	startCall: (
		displayName: string,
		sessionConfig: SessionConfig,
	) => Promise<void>;
	endCall: () => Promise<void>;
	setMuted: (muted: boolean) => Promise<void>;
	setSpeakerEnabled: (enabled: boolean) => Promise<void>;
}
