import type { AgentEvent } from "../../shared/tasks";

type AgentEventListener = (event: AgentEvent) => void;

const listeners: AgentEventListener[] = [];

export function addAgentEventListener(
	callback: AgentEventListener,
): () => void {
	listeners.push(callback);
	return () => {
		const idx = listeners.indexOf(callback);
		if (idx >= 0) listeners.splice(idx, 1);
	};
}

export function emitAgentEvent(event: AgentEvent): void {
	console.log(
		`[DEBUG] emitEvent: ${JSON.stringify(event)} to ${listeners.length} listeners`,
	);
	for (const listener of listeners) {
		try {
			listener(event);
		} catch (err) {
			console.log(`[DEBUG] Listener error: ${err}`);
		}
	}
}
