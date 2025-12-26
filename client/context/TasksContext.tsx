import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Platform } from "react-native";
import { fetchWorkersStatus } from "../services/apiService";
import {
	addWebRTCEventListener,
	sendDataChannelMessage,
} from "../services/callkitService";
import { createEventsService } from "../services/eventsService";
import {
	playInputRequiredSound,
	playTaskFinishedSound,
	playTaskStartSound,
} from "../services/soundService";
import { getSession } from "../services/storageService";
import type { FormValues } from "../types/forms";
import type {
	AgentEvent,
	ContentCard,
	FileRequestEvent,
	FormRequestEvent,
	InputRequestEvent,
	Task,
	ToolInvocation,
} from "../types/tasks";
import type { PendingInputRequest, TaskCard } from "../types/ui";
import { buildTaskCard } from "../utils/taskHelpers";
import { randomUUID } from "../utils/uuid";
import { useAuth } from "./AuthContext";
import { useSettings } from "./SettingsContext";
import { useUI } from "./UIContext";

type WorkerStatusEvent = {
	type: "worker_status";
	connected?: boolean;
};

type RealtimeMessage = {
	type: string;
	[key: string]: unknown;
};

const getTaskId = (value: { task_id?: unknown }): string | null =>
	typeof value.task_id === "string" ? value.task_id : null;

export type TasksContextValue = {
	tasksById: Record<string, Task>;
	tasks: TaskCard[];
	contentCards: ContentCard[];
	pendingInputsByTask: Map<string, PendingInputRequest>;
	pendingInputRequest: PendingInputRequest | null;
	inputRequest: InputRequestEvent | null;
	formRequest: FormRequestEvent | null;
	fileRequest: FileRequestEvent | null;
	streamingResponse: string;
	userTranscript: string;
	timeline: Array<{
		id: string;
		kind: "message" | "tool" | "result";
		timestamp: Date;
		role?: "user" | "assistant";
		content?: string;
		event?: AgentEvent;
	}>;
	workerJoined: boolean;
	workerConnected: boolean;
	workerId: string | null;
	workerWorkspace: { path?: string } | null;
	sendTextMessage: (text: string) => Promise<void>;
	broadcastSystemMessage: (
		message: string,
		triggerResponse?: boolean,
		taskId?: string,
	) => void;
	sendCallHeartbeat: (payload: {
		callId: string;
		ephemeralKey: string;
		active: boolean;
	}) => void;
	handleInputNeededPress: (pending: PendingInputRequest) => void;
	handleInputSubmit: (
		requestId: string,
		value: string,
		taskId?: string,
	) => void;
	handleInputCancel: (requestId: string, taskId?: string) => void;
	handleFormSubmit: (
		requestId: string,
		values: FormValues,
		taskId?: string,
	) => void;
	handleFormCancel: (requestId: string, taskId?: string) => void;
	handleFormDismiss: () => void;
	handleFileUpload: (
		requestId: string,
		fileId: string,
		name: string,
		mime: string,
		size: number,
		chunks: string[],
		taskId?: string,
	) => void;
	handleFileCancel: (requestId: string, taskId?: string) => void;
	removePendingTask: (taskId: string) => void;
	clearTasks: () => void;
	resetRealtimeState: () => void;
};

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

export const TasksProvider = ({ children }: { children: React.ReactNode }) => {
	const { authStatus, checkAuth } = useAuth();
	const { serverUrl } = useSettings();
	const { setErrorMessage } = useUI();

	const [streamingResponse, setStreamingResponse] = useState("");
	const [userTranscript, setUserTranscript] = useState("");
	const [timeline, setTimeline] = useState<TasksContextValue["timeline"]>([]);
	const [tasksById, setTasksById] = useState<Record<string, Task>>({});
	const [contentCards, setContentCards] = useState<ContentCard[]>([]);
	const [inputRequest, setInputRequest] = useState<InputRequestEvent | null>(
		null,
	);
	const [formRequest, setFormRequest] = useState<FormRequestEvent | null>(null);
	const [fileRequest, setFileRequest] = useState<FileRequestEvent | null>(null);
	const [pendingInputsByTask, setPendingInputsByTask] = useState<
		Map<string, PendingInputRequest>
	>(new Map());
	const [pendingInputRequest, setPendingInputRequest] =
		useState<PendingInputRequest | null>(null);
	const [workerJoined, setWorkerJoined] = useState(false);
	const [workerConnected, setWorkerConnected] = useState(false);
	const [workerId, setWorkerId] = useState<string | null>(null);
	const [workerWorkspace, setWorkerWorkspace] = useState<{
		path?: string;
	} | null>(null);

	const eventsWsRef = useRef<WebSocket | null>(null);
	const eventsSessionIdRef = useRef<string | null>(null);
	const lastEventIdRef = useRef<string | null>(null);
	const lastWorkerStatusRef = useRef<boolean | null>(null);
	const lastServerNoticeRef = useRef<string | null>(null);
	const lastAuthRefreshRef = useRef<number>(0);

	const tasks = useMemo(() => {
		return Object.values(tasksById)
			.filter((task) => task.dismissed_at == null)
			.sort(
				(a, b) =>
					(a.started_at ?? a.created_at) - (b.started_at ?? b.created_at),
			)
			.slice(0, 10)
			.map(buildTaskCard);
	}, [tasksById]);

	const broadcastSystemMessage = useCallback(
		(message: string, triggerResponse = true, taskId?: string) => {
			const fullMessage = taskId ? `[Task ${taskId}] ${message}` : message;

			sendDataChannelMessage({
				type: "conversation.item.create",
				item: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: `[SYSTEM] ${fullMessage}` }],
				},
			})
				.then(() => {
					if (triggerResponse) {
						return sendDataChannelMessage({ type: "response.create" });
					}
				})
				.catch((err) => {
					console.log("[broadcast] Data channel not available:", err.message);
				});
		},
		[],
	);

	const announceServerNotice = useCallback(
		(key: string, message: string, setError?: boolean) => {
			if (lastServerNoticeRef.current === key) return;
			lastServerNoticeRef.current = key;
			if (setError) {
				setErrorMessage(message);
			}
			broadcastSystemMessage(message, false);
		},
		[broadcastSystemMessage, setErrorMessage],
	);

	const clearServerNotice = useCallback(
		(_key: string, message: string) => {
			lastServerNoticeRef.current = null;
			setErrorMessage(null);
			broadcastSystemMessage(message, false);
		},
		[broadcastSystemMessage, setErrorMessage],
	);

	useEffect(() => {
		if (lastWorkerStatusRef.current === null) {
			lastWorkerStatusRef.current = workerConnected;
			if (workerConnected) {
				broadcastSystemMessage("Worker connection status: connected.", false);
			}
			return;
		}

		if (lastWorkerStatusRef.current !== workerConnected) {
			lastWorkerStatusRef.current = workerConnected;
			broadcastSystemMessage(
				`Worker connection status: ${workerConnected ? "connected" : "disconnected"}.`,
				false,
			);
		}
	}, [broadcastSystemMessage, workerConnected]);

	const removePendingTask = useCallback((taskId: string) => {
		setTasksById((prev) => {
			if (!prev[taskId]) return prev;
			const next = { ...prev };
			if (taskId.startsWith("pending_")) {
				delete next[taskId];
				console.log(`[tasks] Removed stale pending task: ${taskId}`);
				return next;
			}
			next[taskId] = {
				...next[taskId],
				dismissed_at: Date.now(),
			};
			console.log(`[tasks] Dismissed task from UI: ${taskId}`);
			return next;
		});
	}, []);

	const addMessage = (role: "user" | "assistant", content: string) => {
		const item = {
			id: randomUUID(),
			kind: "message" as const,
			timestamp: new Date(),
			role,
			content,
		};
		setTimeline((prev) => [...prev.slice(-100), item]);
	};

	const handleAgentEvent = useCallback(
		(event: AgentEvent | WorkerStatusEvent) => {
			let sphereContent = "";
			const eventData =
				"data" in event && typeof event.data === "string"
					? event.data
					: undefined;
			const logEvent = {
				...event,
				data: eventData ? `[${eventData.length} chars]` : undefined,
			};
			console.log("[events] handleAgentEvent:", event.type, logEvent);

			const eventTaskId = "task_id" in event ? getTaskId(event) : null;
			if (eventTaskId) {
				setTasksById((prev) => {
					const task = prev[eventTaskId];
					if (!task || task.dismissed_at == null) return prev;
					return {
						...prev,
						[eventTaskId]: {
							...task,
							dismissed_at: undefined,
						},
					};
				});
			}

			if (event.type === "worker_status") {
				const status = event.connected;
				if (typeof status === "boolean") {
					setWorkerConnected(status);
					console.log(`[events] Worker status update: ${status}`);
				}
			} else if (event.type === "task_start") {
				playTaskStartSound();
				const taskId = event.task_id;
				const taskDesc = event.task;
				sphereContent = `TASK: ${taskDesc} `;

				setTasksById((prev) => {
					const next = { ...prev };
					for (const id of Object.keys(next)) {
						if (id.startsWith("pending_") && next[id].status === "pending") {
							delete next[id];
						}
					}
					next[taskId] = {
						id: taskId,
						description: taskDesc,
						status: "running",
						created_at: event.ts,
						started_at: event.ts,
						tool_history: [],
					};
					return next;
				});
				broadcastSystemMessage(
					`The employee has started working on: "${taskDesc}".`,
					false,
					taskId,
				);
			} else if (event.type === "tool_use") {
				const taskId = event.task_id;
				sphereContent = `${event.name}(${event.input || ""}) `;
				if (Platform.OS === "ios") {
					const inputPayload = event.input ? JSON.stringify(event.input) : "";
					console.log(
						`[voice] tool_use name=${event.name} input=${inputPayload} task_id=${taskId} ts=${event.ts}`,
					);
				}

				setTasksById((prev) => {
					const task = prev[taskId];
					if (!task) {
						console.warn(
							`[events] tool_use for unknown task: ${taskId}`,
							Object.keys(prev),
						);
						return prev;
					}

					const toolInv: ToolInvocation = {
						name: event.name,
						input: event.input,
						started_at: event.ts,
						status: "running",
					};

					const updated = {
						...prev,
						[taskId]: {
							...task,
							current_tool: event.name,
							tool_history: [...(task.tool_history || []), toolInv],
							dismissed_at: undefined,
						},
					};
					console.log(
						`[events] tool_use updated task ${taskId}, tool_history length:`,
						updated[taskId].tool_history.length,
					);
					return updated;
				});
			} else if (event.type === "task_done") {
				playTaskFinishedSound();
				const taskId = event.task_id;
				const resultText = event.text || "Task completed";
				sphereContent = `DONE: ${resultText.slice(0, 100)} `;

				setTasksById((prev) => {
					const task = prev[taskId];
					if (!task) {
						console.warn(`[events] task_done for unknown task: ${taskId}`);
						return prev;
					}

					const updated: Record<string, Task> = {
						...prev,
						[taskId]: {
							...task,
							status: "completed" as const,
							completed_at: event.ts,
							duration_ms: event.duration_ms,
							result_text: resultText,
							current_tool: undefined,
							dismissed_at: undefined,
						},
					};
					console.log(
						`[events] task_done updated task ${taskId}, result_text:`,
						resultText.slice(0, 50),
					);
					return updated;
				});
				broadcastSystemMessage(
					`The employee finished the task. Result: ${resultText.slice(0, 150)}`,
					false,
					taskId,
				);
			} else if (event.type === "task_cancelled") {
				const taskId = event.task_id;
				sphereContent = `CANCELLED `;

				setTasksById((prev) => {
					const task = prev[taskId];
					if (!task) return prev;

					const now = event.ts;
					return {
						...prev,
						[taskId]: {
							...task,
							status: "cancelled",
							completed_at: now,
							duration_ms: task.started_at ? now - task.started_at : undefined,
							result_text: "Cancelled",
							current_tool: undefined,
							dismissed_at: undefined,
						},
					};
				});
			} else if (event.type === "task_update") {
				const taskId = event.task_id;
				if (event.title) {
					setTasksById((prev) => {
						const task = prev[taskId];
						if (!task) return prev;
						return {
							...prev,
							[taskId]: {
								...task,
								description: event.title!,
								dismissed_at: undefined,
							},
						};
					});
					console.log(
						`[events] task_update updated task ${taskId} title to: ${event.title}`,
					);
				}
			} else if (event.type === "message" || event.type === "error") {
				console.log(
					"[events] Content event received:",
					event.type,
					"id:",
					event.id,
					"task_id:",
					event.task_id,
				);
				setContentCards((prev) => {
					const taskId = event.task_id;
					if (taskId) {
						const filtered = prev.filter((c) => c.task_id !== taskId);
						console.log("[events] Replacing content for task:", taskId);
						return [...filtered.slice(-50), event];
					}
					if (prev.some((c) => c.id === event.id)) {
						console.log("[events] Duplicate event, skipping");
						return prev;
					}
					return [...prev.slice(-50), event];
				});

				const contentTaskId = event.task_id;
				if (event.type === "error") {
					broadcastSystemMessage(
						`An error occurred: ${event.message}.${event.suggestion ? ` Suggestion: ${event.suggestion}` : ""}`,
						true,
						contentTaskId,
					);
				} else if (event.type === "message" && event.title) {
					broadcastSystemMessage(
						`Content appeared with title "${event.title}".`,
						false,
						contentTaskId,
					);
				}
			} else if (event.type === "input_request") {
				playInputRequiredSound();
				console.log(
					"[events] Input request received:",
					event.id,
					event.prompt,
					"task_id:",
					event.task_id,
				);
				const pending: PendingInputRequest = { kind: "input", request: event };
				if (event.task_id) {
					setPendingInputsByTask((prev) =>
						new Map(prev).set(event.task_id!, pending),
					);
				} else {
					setPendingInputRequest(pending);
				}
				broadcastSystemMessage(
					`The user needs to provide input: "${event.prompt}". Let them know.`,
					true,
					event.task_id,
				);
			} else if (event.type === "form_request") {
				playInputRequiredSound();
				console.log(
					"[events] Form request received:",
					JSON.stringify(event, null, 2),
				);
				console.log("[events] Form request form object:", event.form);
				console.log("[events] Form request form fields:", event.form?.fields);
				const pending: PendingInputRequest = { kind: "form", request: event };
				if (event.task_id) {
					setPendingInputsByTask((prev) =>
						new Map(prev).set(event.task_id!, pending),
					);
				} else {
					setPendingInputRequest(pending);
				}

				const formTitle = event.form?.title || "a form";
				const formDescription = event.form?.description || "";
				broadcastSystemMessage(
					`A form has appeared on the user's screen: "${formTitle}". ${formDescription ? `${formDescription}. ` : ""}Let them know they need to fill it out.`,
					true,
					event.task_id,
				);
			} else if (event.type === "file_request") {
				playInputRequiredSound();
				console.log(
					"[events] File request received:",
					event.id,
					event.prompt,
					"task_id:",
					event.task_id,
				);
				const pending: PendingInputRequest = { kind: "file", request: event };
				if (event.task_id) {
					setPendingInputsByTask((prev) =>
						new Map(prev).set(event.task_id!, pending),
					);
				} else {
					setPendingInputRequest(pending);
				}
				broadcastSystemMessage(
					`The user needs to provide a file: "${event.prompt}". Let them know.`,
					true,
					event.task_id,
				);
			}

			if (sphereContent) {
				// sphereText is currently unused; keep for parity
			}
		},
		[broadcastSystemMessage],
	);

	useEffect(() => {
		if (authStatus === "authenticated" && serverUrl) {
			const service = createEventsService({
				serverUrl,
				getSession,
				getSessionId: () => eventsSessionIdRef.current,
				setSessionId: (id) => {
					eventsSessionIdRef.current = id;
				},
				getLastEventId: () => lastEventIdRef.current,
				setLastEventId: (id) => {
					lastEventIdRef.current = id;
				},
				onAgentEvent: handleAgentEvent,
				onWorkerStatus: (status) => {
					setWorkerConnected(status);
					if (status) setWorkerJoined(true);
					console.log(`[events] Worker connected: ${status}`);
				},
				onSocketChange: (socket) => {
					eventsWsRef.current = socket;
				},
				onConnectionEvent: (event) => {
					if (event.type === "open") {
						clearServerNotice(
							"server_disconnected",
							"Server connection restored.",
						);
						return;
					}
					if (event.type === "reconnect") {
						announceServerNotice(
							"server_reconnecting",
							"Server connection lost. Reconnecting...",
							true,
						);
						return;
					}
					if (event.type === "error") {
						announceServerNotice(
							"server_error",
							"Server connection error. Retrying...",
							true,
						);
						return;
					}
					if (event.type === "close") {
						if (event.code === 1000) {
							announceServerNotice(
								"server_closed",
								"Server connection closed.",
								false,
							);
							return;
						}
						announceServerNotice(
							"server_disconnected",
							`Server connection dropped${event.code ? ` (code ${event.code})` : ""}. Reconnecting...`,
							true,
						);
					}
				},
			});
			service.setEnabled(true);
			service.connect();
			return () => {
				service.setEnabled(false);
				service.disconnect();
			};
		}
	}, [
		authStatus,
		serverUrl,
		handleAgentEvent,
		announceServerNotice,
		clearServerNotice,
	]);

	useEffect(() => {
		if (authStatus === "authenticated" && serverUrl) {
			const check = async () => {
				try {
					const response = await fetchWorkersStatus(serverUrl, {
						getSession,
					});
					if (!response.ok) {
						if (response.status === 401 || response.status === 403) {
							const now = Date.now();
							if (
								authStatus === "authenticated" &&
								now - lastAuthRefreshRef.current > 30000
							) {
								lastAuthRefreshRef.current = now;
								announceServerNotice(
									"server_auth_refresh",
									"Session expired. Re-authenticating...",
									true,
								);
								try {
									await checkAuth();
									clearServerNotice("server_auth_refresh", "Re-authenticated.");
									return;
								} catch {
									// fall through to error notice
								}
							}
							announceServerNotice(
								"server_auth",
								"Server auth expired. Please re-pair your device.",
								true,
							);
						} else if (response.status >= 500) {
							announceServerNotice(
								"server_down",
								"Server unavailable. Retrying...",
								true,
							);
						}
						return;
					}
					const data = response.data || {};
					setWorkerConnected(data.connected === true);
					setWorkerJoined(data.joined === true || data.connected === true);
					setWorkerId(data.worker_id || null);
					setWorkerWorkspace(data.workspace || null);
				} catch (err) {
					const error = err instanceof Error ? err : new Error(String(err));
					console.warn("[workers] Check failed:", error.message);
					announceServerNotice(
						"server_unreachable",
						"Server unreachable. Check your connection.",
						true,
					);
				}
			};

			check();
			const interval = setInterval(check, 30000);
			return () => clearInterval(interval);
		}
	}, [
		authStatus,
		serverUrl,
		announceServerNotice,
		checkAuth,
		clearServerNotice,
	]);

	const handleFunctionCall = useCallback(
		(msg: unknown) => {
			if (!msg || typeof msg !== "object") return;
			const message = msg as RealtimeMessage;
			const functionName = typeof message.name === "string" ? message.name : "";
			const callId = typeof message.call_id === "string" ? message.call_id : "";
			if (functionName !== "read_content" || !callId) {
				return;
			}

			let args: Record<string, unknown> = {};
			const argsRaw =
				typeof message.arguments === "string" ? message.arguments : "{}";
			try {
				args = JSON.parse(argsRaw);
			} catch (_e) {
				console.warn("[function_call] Failed to parse arguments:", argsRaw);
			}

			console.log(
				`[function_call] ${functionName}(${JSON.stringify(args)}) call_id=${callId}`,
			);

			const requestedTaskId =
				typeof args.task_id === "string" ? args.task_id : null;

			const sortedCards = [...contentCards].sort((a, b) => {
				const aTs = a.ts ?? 0;
				const bTs = b.ts ?? 0;
				return aTs - bTs;
			});

			let targetTaskId = requestedTaskId;
			if (!targetTaskId && sortedCards.length > 0) {
				const lastCard = sortedCards[sortedCards.length - 1];
				targetTaskId = lastCard.task_id ?? null;
			}

			const scopedCards = targetTaskId
				? sortedCards.filter((card) => card.task_id === targetTaskId)
				: sortedCards;

			const stripMarkdown = (text: string) => {
				return text
					.replace(/```[\s\S]*?```/g, "")
					.replace(/`([^`]+)`/g, "$1")
					.replace(/!\[[^\]]*\]\([^)]+\)/g, "")
					.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
					.replace(/^#{1,6}\s*/gm, "")
					.replace(/^[>*+-]\s+/gm, "")
					.replace(/[*_~]+/g, "")
					.replace(/\s+/g, " ")
					.trim();
			};

			const stripHtml = (text: string) => {
				return text
					.replace(/<style[\s\S]*?<\/style>/gi, "")
					.replace(/<script[\s\S]*?<\/script>/gi, "")
					.replace(/<[^>]+>/g, " ")
					.replace(/\s+/g, " ")
					.trim();
			};

			const toPlainText = (text: string, format?: string) => {
				if (!text) return "";
				if (format === "html") return stripHtml(text);
				if (format === "markdown") return stripMarkdown(text);
				return stripMarkdown(text);
			};

			const items = scopedCards.map((card) => {
				if (card.type === "message") {
					const plainText = toPlainText(card.text || "", card.format);
					const withTitle = card.title
						? `${card.title}\n${plainText}`
						: plainText;
					return {
						type: "message",
						task_id: card.task_id,
						title: card.title,
						text: withTitle,
					};
				}
				const errorText = toPlainText(card.message || "");
				return {
					type: "error",
					task_id: card.task_id,
					text: errorText,
				};
			});

			const result = {
				taskId: targetTaskId,
				itemCount: items.length,
				items,
				summary:
					items.length === 0
						? "No content is currently displayed on the user's screen."
						: `Read ${items.length} content item(s).`,
			};

			sendDataChannelMessage({
				type: "conversation.item.create",
				item: {
					type: "function_call_output",
					call_id: callId,
					output: JSON.stringify(result),
				},
			})
				.then(() => sendDataChannelMessage({ type: "response.create" }))
				.catch((err) =>
					console.warn("[function_call] Failed to send result:", err),
				);
		},
		[contentCards],
	);

	const handleRealtimeEvent = useCallback(
		(msg: unknown) => {
			if (!msg || typeof msg !== "object") return;
			const message = msg as RealtimeMessage;
			const type = message.type;

			if (type === "native_log") {
				const nativeMessage =
					typeof message.message === "string" ? message.message : "";
				console.log("[Native]", nativeMessage);
				return;
			}

			switch (type) {
				case "response.output_audio.delta":
				case "response.output_audio_transcript.delta": {
					if (type === "response.output_audio_transcript.delta") {
						const delta =
							typeof message.delta === "string" ? message.delta : "";
						setStreamingResponse((prev) => prev + delta);
					}
					break;
				}
				case "response.output_audio_transcript.done": {
					const transcript =
						typeof message.transcript === "string" ? message.transcript : "";
					if (streamingResponse || transcript) {
						const responseText = streamingResponse || transcript;
						setTimeline((prev) => {
							const lastUserMessage = [...prev]
								.reverse()
								.find(
									(item) => item.kind === "message" && item.role === "user",
								);
							const responseItem = {
								id: randomUUID(),
								kind: "message" as const,
								timestamp: new Date(),
								role: "assistant" as const,
								content: responseText,
							};
							return lastUserMessage
								? [lastUserMessage, responseItem]
								: [responseItem];
						});
					}
					setStreamingResponse("");
					break;
				}
				case "conversation.item.input_audio_transcription.delta": {
					const delta = typeof message.delta === "string" ? message.delta : "";
					if (delta) {
						setUserTranscript((prev) => prev + delta);
					}
					break;
				}
				case "conversation.item.input_audio_transcription.completed": {
					if (Array.isArray(message.logprobs) && message.logprobs.length > 0) {
						const MIN_CONFIDENCE = 0.5;
						const confidentTokens = message.logprobs
							.filter((lp) => {
								const logprob =
									typeof (lp as { logprob?: unknown }).logprob === "number"
										? (lp as { logprob: number }).logprob
										: null;
								return logprob !== null && Math.exp(logprob) >= MIN_CONFIDENCE;
							})
							.map((lp) => {
								const token =
									typeof (lp as { token?: unknown }).token === "string"
										? (lp as { token: string }).token
										: "";
								return token;
							});

						const filteredText = confidentTokens.join("").trim();
						setUserTranscript(filteredText || "");
					}
					setTimeout(() => setUserTranscript(""), 3000);
					break;
				}
				case "response.function_call_arguments.done":
					handleFunctionCall(message);
					break;
				case "error": {
					const errorValue =
						typeof message.error === "object" && message.error
							? (message.error as { code?: unknown; message?: unknown })
							: null;
					const errorCode =
						typeof errorValue?.code === "string" ? errorValue.code : "";
					if (errorCode === "conversation_already_has_active_response") {
						console.log("[realtime] Ignoring expected error:", errorCode);
						break;
					}
					console.error("[realtime] Error:", message.error);
					const errorMessage =
						typeof errorValue?.message === "string"
							? errorValue.message
							: "An error occurred";
					setErrorMessage(errorMessage);
					break;
				}
			}
		},
		[handleFunctionCall, setErrorMessage, streamingResponse],
	);

	useEffect(() => {
		const unsubWebRTC = addWebRTCEventListener((event) => {
			handleRealtimeEvent(event);
		});

		return () => unsubWebRTC();
	}, [handleRealtimeEvent]);

	const sendInputResponse = useCallback(
		(requestId: string, value: string, cancelled = false) => {
			if (eventsWsRef.current?.readyState === WebSocket.OPEN) {
				const response = {
					type: "input_response",
					id: requestId,
					value,
					cancelled,
				};
				console.log("[events] Sending input response:", response);
				eventsWsRef.current.send(JSON.stringify(response));
			} else {
				console.warn("[events] WebSocket not open, cannot send input response");
			}
		},
		[],
	);

	const sendCallHeartbeat = useCallback(
		(payload: { callId: string; ephemeralKey: string; active: boolean }) => {
			if (eventsWsRef.current?.readyState === WebSocket.OPEN) {
				eventsWsRef.current.send(
					JSON.stringify({
						type: "call_heartbeat",
						call_id: payload.callId,
						ephemeral_key: payload.ephemeralKey,
						active: payload.active,
					}),
				);
			}
		},
		[],
	);

	const clearPendingInput = useCallback((taskId?: string) => {
		if (taskId) {
			setPendingInputsByTask((prev) => {
				const next = new Map(prev);
				next.delete(taskId);
				return next;
			});
		}
		setPendingInputRequest(null);
	}, []);

	const handleInputSubmit = useCallback(
		(requestId: string, value: string, taskId?: string) => {
			sendInputResponse(requestId, value, false);
			setInputRequest(null);
			clearPendingInput(taskId);
		},
		[sendInputResponse, clearPendingInput],
	);

	const handleInputCancel = useCallback(
		(requestId: string, taskId?: string) => {
			sendInputResponse(requestId, "", true);
			setInputRequest(null);
			clearPendingInput(taskId);
			broadcastSystemMessage("The user cancelled the input request.", false);
		},
		[sendInputResponse, clearPendingInput, broadcastSystemMessage],
	);

	const handleFormSubmit = useCallback(
		(requestId: string, values: FormValues, taskId?: string) => {
			sendInputResponse(requestId, JSON.stringify(values), false);
			setFormRequest(null);
			clearPendingInput(taskId);
			broadcastSystemMessage("The user has submitted the form.");
		},
		[sendInputResponse, clearPendingInput, broadcastSystemMessage],
	);

	const handleFormCancel = useCallback(
		(requestId: string, taskId?: string) => {
			sendInputResponse(requestId, "", true);
			setFormRequest(null);
			clearPendingInput(taskId);
			broadcastSystemMessage("The user cancelled the form.", false);
		},
		[sendInputResponse, clearPendingInput, broadcastSystemMessage],
	);

	const handleFormDismiss = useCallback(() => {
		setFormRequest(null);
	}, []);

	const handleInputNeededPress = useCallback((pending: PendingInputRequest) => {
		switch (pending.kind) {
			case "input":
				setInputRequest(pending.request);
				break;
			case "form":
				setFormRequest(pending.request);
				break;
			case "file":
				setFileRequest(pending.request);
				break;
		}
	}, []);

	const handleFileUpload = useCallback(
		(
			requestId: string,
			fileId: string,
			name: string,
			mime: string,
			size: number,
			chunks: string[],
			taskId?: string,
		) => {
			const ws = eventsWsRef.current;
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				console.error("[events] WebSocket not open, cannot upload file");
				return;
			}

			try {
				ws.send(
					JSON.stringify({
						type: "file_upload_start",
						id: requestId,
						ts: Date.now(),
						file_id: fileId,
						name,
						mime,
						size,
						total_chunks: chunks.length,
					}),
				);

				for (let i = 0; i < chunks.length; i++) {
					if (ws.readyState !== WebSocket.OPEN) {
						throw new Error("WebSocket closed during upload");
					}
					ws.send(
						JSON.stringify({
							type: "file_upload_chunk",
							id: `${fileId}-${i}`,
							ts: Date.now(),
							file_id: fileId,
							chunk_index: i,
							data: chunks[i],
						}),
					);
				}

				console.log(
					`[events] Sent file upload: ${name} (${chunks.length} chunks)`,
				);
				setFileRequest(null);
				clearPendingInput(taskId);
				broadcastSystemMessage("The user has uploaded a file.");
			} catch (err) {
				console.error("[events] File upload failed:", err);
			}
		},
		[broadcastSystemMessage, clearPendingInput],
	);

	const handleFileCancel = useCallback(
		(requestId: string, taskId?: string) => {
			sendInputResponse(requestId, "", true);
			setFileRequest(null);
			clearPendingInput(taskId);
			broadcastSystemMessage("The user cancelled the file request.", false);
		},
		[sendInputResponse, clearPendingInput, broadcastSystemMessage],
	);

	const sendTextMessage = async (text: string) => {
		addMessage("user", text);

		const pendingTaskId = `pending_${randomUUID()}`;
		const now = Date.now();
		setTasksById((prev) => ({
			...prev,
			[pendingTaskId]: {
				id: pendingTaskId,
				description: text,
				status: "pending",
				created_at: now,
				started_at: now,
				tool_history: [],
			},
		}));

		try {
			await sendDataChannelMessage({
				type: "conversation.item.create",
				item: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text }],
				},
			});
			await sendDataChannelMessage({ type: "response.create" });
			console.log("[sendTextMessage] Sent text message:", text);
		} catch (err) {
			console.warn("[sendTextMessage] Failed to send text message:", err);
		}
	};

	const clearTasks = () => {
		setTasksById({});
		setContentCards([]);
	};

	const resetRealtimeState = () => {
		setStreamingResponse("");
		setUserTranscript("");
	};

	const value: TasksContextValue = {
		tasksById,
		tasks,
		contentCards,
		pendingInputsByTask,
		pendingInputRequest,
		inputRequest,
		formRequest,
		fileRequest,
		streamingResponse,
		userTranscript,
		timeline,
		workerJoined,
		workerConnected,
		workerId,
		workerWorkspace,
		sendTextMessage,
		broadcastSystemMessage,
		sendCallHeartbeat,
		handleInputNeededPress,
		handleInputSubmit,
		handleInputCancel,
		handleFormSubmit,
		handleFormCancel,
		handleFormDismiss,
		handleFileUpload,
		handleFileCancel,
		removePendingTask,
		clearTasks,
		resetRealtimeState,
	};

	return (
		<TasksContext.Provider value={value}>{children}</TasksContext.Provider>
	);
};

export const useTasks = () => {
	const context = useContext(TasksContext);
	if (!context) {
		throw new Error("useTasks must be used within a TasksProvider");
	}
	return context;
};
