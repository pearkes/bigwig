import type {
	FileRequestEvent,
	FormRequestEvent,
	InputRequestEvent,
	Task,
} from "./tasks";

// TaskCard is a view model derived from Task for UI rendering
export type TaskCard = Task & {
	// Computed helpers for UI (backwards compat)
	startTime: Date;
	endTime?: Date;
	task: string; // alias for description
	durationMs?: number; // alias for duration_ms
	result?: string; // alias for result_text
};

// Pending input request type for the input needed card
export type PendingInputRequest =
	| { kind: "input"; request: InputRequestEvent }
	| { kind: "form"; request: FormRequestEvent }
	| { kind: "file"; request: FileRequestEvent };
