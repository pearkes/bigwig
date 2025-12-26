import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import type React from "react";
import { useMemo } from "react";
import type { ViewStyle } from "react-native";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Modal,
	Platform,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Markdown from "react-native-markdown-display";
import type { AnimatedStyleProp } from "react-native-reanimated";
import Animated from "react-native-reanimated";
import { ExpandableTaskCard } from "../components/ExpandableTaskCard";
import { FileRequestModal } from "../components/FileRequestModal";
import { FormModal } from "../components/forms";
import { HeaderStatusMenu } from "../components/HeaderStatusMenu";
import { InputPromptModal } from "../components/InputPromptModal";
import { SettingsModal } from "../components/modals/SettingsModal";
import { WorkerInfoModal } from "../components/modals/WorkerInfoModal";
import { InputNeededCard } from "../components/tasks/InputNeededCard";
import type { ThemeMode, ThemePreference } from "../theme/theme";
import type { CallStatus } from "../types/call";
import type { FormValues } from "../types/forms";
import type {
	ContentCard,
	FileRequestEvent,
	FormRequestEvent,
	InputRequestEvent,
} from "../types/tasks";
import type { PendingInputRequest, TaskCard } from "../types/ui";
import { isMarkdown } from "../utils/markdown";
import { isTaskActive } from "../utils/taskHelpers";
import { getActiveStyles, getMarkdownStyles } from "./activeStyles";

export type ActiveScreenProps = {
	showDropdown: boolean;
	onToggleDropdown: () => void;
	onOpenWorkerInfo: () => void;
	onOpenSettings: () => void;
	onClearTasks: () => void;
	onEndSession: () => void;
	callStatus: CallStatus;
	isMuted: boolean;
	isSpeakerEnabled: boolean;
	onToggleMute: () => void;
	onToggleSpeaker: () => void;
	showTranscript: boolean;
	streamingResponse: string;
	userTranscript: string;
	pendingInputRequest: PendingInputRequest | null;
	onInputNeededPress: (pending: PendingInputRequest) => void;
	tasks: TaskCard[];
	expandedTaskId: string | null;
	onToggleTaskExpanded: (taskId: string) => void;
	onAutoExpandTask: (taskId: string) => void;
	onFadeCompleteTask: (taskId: string) => void;
	onDismissTask: (task: TaskCard) => void;
	onBroadcastTask: (message: string, taskId: string) => void;
	pendingInputsByTask: Map<string, PendingInputRequest>;
	contentCards: ContentCard[];
	textInput: string;
	onChangeTextInput: (value: string) => void;
	onSubmitText: () => void;
	inputAreaStyle: AnimatedStyleProp<ViewStyle>;
	scrollRef: React.RefObject<ScrollView>;
	selectedTask: TaskCard | null;
	onCloseTaskModal: () => void;
	inputRequest: InputRequestEvent | null;
	onInputSubmit: (requestId: string, value: string, taskId?: string) => void;
	onInputCancel: (requestId: string, taskId?: string) => void;
	formRequest: FormRequestEvent | null;
	onFormSubmit: (
		requestId: string,
		values: FormValues,
		taskId?: string,
	) => void;
	onFormCancel: (requestId: string, taskId?: string) => void;
	onFormDismiss: () => void;
	fileRequest: FileRequestEvent | null;
	onFileUpload: (
		requestId: string,
		fileId: string,
		name: string,
		mime: string,
		size: number,
		chunks: string[],
		taskId?: string,
	) => void;
	onFileCancel: (requestId: string, taskId?: string) => void;
	showWorkerInfo: boolean;
	showSettings: boolean;
	workerConnected: boolean;
	workerId: string | null;
	workerWorkspace: { path?: string } | null;
	onCloseWorkerInfo: () => void;
	onCloseSettings: () => void;
	muteMicByDefault: boolean;
	autoStartVoice: boolean;
	onToggleMuteMicByDefault: () => void;
	onToggleAutoStartVoice: () => void;
	onToggleShowTranscript: () => void;
	themePreference: ThemePreference;
	resolvedTheme: ThemeMode;
	onSetThemePreference: (preference: ThemePreference) => void;
};

export const ActiveScreen = ({
	showDropdown,
	onToggleDropdown,
	onOpenWorkerInfo,
	onOpenSettings,
	onClearTasks,
	onEndSession,
	callStatus,
	isMuted,
	isSpeakerEnabled,
	onToggleMute,
	onToggleSpeaker,
	showTranscript,
	streamingResponse,
	userTranscript,
	pendingInputRequest,
	onInputNeededPress,
	tasks,
	expandedTaskId,
	onToggleTaskExpanded,
	onAutoExpandTask,
	onFadeCompleteTask,
	onDismissTask,
	onBroadcastTask,
	pendingInputsByTask,
	contentCards,
	textInput,
	onChangeTextInput,
	onSubmitText,
	inputAreaStyle,
	scrollRef,
	selectedTask,
	onCloseTaskModal,
	inputRequest,
	onInputSubmit,
	onInputCancel,
	formRequest,
	onFormSubmit,
	onFormCancel,
	onFormDismiss,
	fileRequest,
	onFileUpload,
	onFileCancel,
	showWorkerInfo,
	showSettings,
	workerConnected,
	workerId,
	workerWorkspace,
	onCloseWorkerInfo,
	onCloseSettings,
	muteMicByDefault,
	autoStartVoice,
	onToggleMuteMicByDefault,
	onToggleAutoStartVoice,
	onToggleShowTranscript,
	themePreference,
	resolvedTheme,
	onSetThemePreference,
}: ActiveScreenProps) => {
	const activeStyles = useMemo(
		() => getActiveStyles(resolvedTheme),
		[resolvedTheme],
	);
	const markdownStyles = useMemo(
		() => getMarkdownStyles(resolvedTheme),
		[resolvedTheme],
	);
	const isDark = resolvedTheme === "dark";
	const statusBarStyle = isDark ? "light" : "dark";
	const placeholderTextColor = isDark ? "#9c9c9c" : "#999";
	const speakerIconColor = isSpeakerEnabled
		? isDark
			? "#7fb7ff"
			: "#2196F3"
		: isDark
			? "#9c9c9c"
			: "#999";
	const micIconColor = isMuted
		? isDark
			? "#ff6b6b"
			: "#e53935"
		: isDark
			? "#f5f5f5"
			: "#333";
	const activityColor = isDark ? "#7fb7ff" : "#007AFF";
	const vignetteLeft = isDark
		? ["#0f0f0f", "rgba(15,15,15,0.9)", "rgba(15,15,15,0)"]
		: ["#fff", "rgba(255,255,255,0.9)", "rgba(255,255,255,0)"];
	const vignetteRight = isDark
		? ["rgba(15,15,15,0)", "rgba(15,15,15,0.9)", "#0f0f0f"]
		: ["rgba(255,255,255,0)", "rgba(255,255,255,0.9)", "#fff"];

	return (
		<GestureHandlerRootView style={activeStyles.container}>
			<LinearGradient
				colors={vignetteLeft}
				locations={[0, 0.6, 1]}
				start={{ x: 0, y: 0.5 }}
				end={{ x: 1, y: 0.5 }}
				style={activeStyles.vignetteLeft}
				pointerEvents="none"
			/>
			<LinearGradient
				colors={vignetteRight}
				locations={[0, 0.4, 1]}
				start={{ x: 0, y: 0.5 }}
				end={{ x: 1, y: 0.5 }}
				style={activeStyles.vignetteRight}
				pointerEvents="none"
			/>

			<KeyboardAvoidingView
				style={activeStyles.containerInner}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				keyboardVerticalOffset={0}
			>
				<StatusBar style={statusBarStyle} />

				{/* Header */}
				<View style={activeStyles.header}>
					<HeaderStatusMenu
						label="Active"
						dotColor={callStatus === "connected" ? "#4CAF50" : "#999"}
						showDropdown={showDropdown}
						onToggle={onToggleDropdown}
						variant={isDark ? "dark" : undefined}
						items={[
							{ label: "Worker Info", onPress: onOpenWorkerInfo },
							{ label: "Settings", onPress: onOpenSettings },
							{ label: "Clear Tasks", onPress: onClearTasks },
							{
								label: "End Session",
								variant: "danger",
								isLast: true,
								onPress: onEndSession,
							},
						]}
					/>

					{/* Audio controls - top right */}
					<View style={activeStyles.audioControls}>
						<TouchableOpacity
							style={[
								activeStyles.muteButton,
								isSpeakerEnabled && activeStyles.speakerButtonActive,
							]}
							onPress={onToggleSpeaker}
						>
							<Ionicons
								name={isSpeakerEnabled ? "volume-high" : "volume-high-outline"}
								size={18}
								color={speakerIconColor}
							/>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								activeStyles.muteButton,
								isMuted && activeStyles.muteButtonActive,
							]}
							onPress={onToggleMute}
						>
							<Ionicons
								name={isMuted ? "mic-off" : "mic"}
								size={18}
								color={micIconColor}
							/>
						</TouchableOpacity>
					</View>
				</View>

				{/* Task cards - full screen height */}
				<ScrollView
					ref={scrollRef}
					style={activeStyles.taskCardsContainer}
					contentContainerStyle={activeStyles.taskCardsContent}
					showsVerticalScrollIndicator={false}
					keyboardDismissMode="on-drag"
					keyboardShouldPersistTaps="handled"
				>
					{showTranscript && streamingResponse && (
						<View style={activeStyles.agentTranscriptRow}>
							<Text style={activeStyles.agentTranscriptText} numberOfLines={2}>
								{streamingResponse}
							</Text>
						</View>
					)}
					{showTranscript && userTranscript && (
						<View style={activeStyles.userTranscriptRow}>
							<Text style={activeStyles.userTranscriptText} numberOfLines={2}>
								{userTranscript}
							</Text>
						</View>
					)}

					{/* Standalone Input Needed Card - for requests without task_id */}
					{pendingInputRequest && (
						<InputNeededCard
							pendingRequest={pendingInputRequest}
							onPress={() => onInputNeededPress(pendingInputRequest)}
							resolvedTheme={resolvedTheme}
						/>
					)}

					{/* Expandable Task Cards - content shown inside when expanded */}
					{tasks.map((task, index) => (
						<ExpandableTaskCard
							key={task.id}
							task={task}
							index={index}
							isExpanded={expandedTaskId === task.id}
							onPress={() => onToggleTaskExpanded(task.id)}
							onAutoExpand={onAutoExpandTask}
							onFadeComplete={() => onFadeCompleteTask(task.id)}
							onDismiss={() => onDismissTask(task)}
							onBroadcast={(message) => onBroadcastTask(message, task.id)}
							pendingInput={pendingInputsByTask.get(task.id)}
							onInputNeededPress={onInputNeededPress}
							contentCards={contentCards}
							resolvedTheme={resolvedTheme}
						/>
					))}
				</ScrollView>

				{/* Input */}
				<Animated.View style={[activeStyles.inputArea, inputAreaStyle]}>
					<View style={activeStyles.inputRow}>
						<TextInput
							value={textInput}
							onChangeText={onChangeTextInput}
							placeholder="Type a message..."
							placeholderTextColor={placeholderTextColor}
							style={activeStyles.textInput}
							onSubmitEditing={onSubmitText}
							returnKeyType="send"
							blurOnSubmit={false}
							enablesReturnKeyAutomatically
						/>
						<TouchableOpacity
							onPress={onSubmitText}
							style={[
								activeStyles.sendBtn,
								!textInput.trim() && activeStyles.sendBtnDisabled,
							]}
							disabled={!textInput.trim()}
						>
							<Text style={activeStyles.sendArrow}>↑</Text>
						</TouchableOpacity>
					</View>
				</Animated.View>

				{/* Task Detail Modal */}
				<Modal visible={!!selectedTask} animationType="slide" transparent>
					<BlurView
						intensity={40}
						tint={isDark ? "dark" : "default"}
						style={activeStyles.taskModalOverlay}
					>
						<TouchableOpacity
							style={activeStyles.taskModalDismissArea}
							activeOpacity={1}
							onPress={onCloseTaskModal}
						/>
						<View style={activeStyles.taskModalContent}>
							{selectedTask &&
								(() => {
									const currentTask =
										tasks.find((t) => t.id === selectedTask.id) || selectedTask;
									const elapsed = isTaskActive(currentTask.status)
										? Date.now() - currentTask.startTime.getTime()
										: currentTask.durationMs || currentTask.duration_ms || 0;
									const elapsedSecs = (elapsed / 1000).toFixed(1);
									const displayResult =
										currentTask.result || currentTask.result_text;
									const toolHistory = currentTask.tool_history || [];

									return (
										<>
											<View style={activeStyles.taskModalHeader}>
												<View style={activeStyles.taskModalTitleRow}>
													{isTaskActive(currentTask.status) ? (
														<ActivityIndicator
															size="small"
															color={activityColor}
														/>
													) : (
														<Text style={activeStyles.taskCardCheck}>✓</Text>
													)}
													<Text style={activeStyles.taskModalTitle}>
														{currentTask.task || currentTask.description}
													</Text>
												</View>
												<TouchableOpacity onPress={onCloseTaskModal}>
													<Text style={activeStyles.taskModalCloseBtn}>✕</Text>
												</TouchableOpacity>
											</View>

											<View style={activeStyles.taskModalMeta}>
												<Text style={activeStyles.taskModalMetaText}>
													{isTaskActive(currentTask.status)
														? "Running"
														: "Completed"}{" "}
													• {elapsedSecs}s
												</Text>
											</View>

											<ScrollView
												style={activeStyles.taskModalScroll}
												contentContainerStyle={
													activeStyles.taskModalScrollContent
												}
												showsVerticalScrollIndicator={true}
											>
												{displayResult && (
													<View style={activeStyles.taskModalSection}>
														<Text style={activeStyles.taskModalSectionTitle}>
															Result
														</Text>
														{isMarkdown(displayResult) ? (
															<Markdown style={markdownStyles}>
																{displayResult}
															</Markdown>
														) : (
															<Text
																style={activeStyles.taskModalResultText}
																selectable
															>
																{displayResult}
															</Text>
														)}
													</View>
												)}

												{toolHistory.length > 0 && (
													<View style={activeStyles.taskModalSection}>
														<Text style={activeStyles.taskModalSectionTitle}>
															Tools ({toolHistory.length})
														</Text>
														{toolHistory.map((tool, index) => (
															<View
																key={index}
																style={activeStyles.taskModalToolRow}
															>
																<Text style={activeStyles.taskModalToolName}>
																	{tool.name}
																</Text>
																{tool.input && (
																	<Text
																		style={activeStyles.taskModalToolInput}
																		numberOfLines={2}
																	>
																		{tool.input}
																	</Text>
																)}
															</View>
														))}
													</View>
												)}
											</ScrollView>
										</>
									);
								})()}
						</View>
					</BlurView>
				</Modal>

				{/* Modals */}
				<WorkerInfoModal
					visible={showWorkerInfo}
					workerConnected={workerConnected}
					workerId={workerId}
					workerWorkspace={workerWorkspace}
					onClose={onCloseWorkerInfo}
					resolvedTheme={resolvedTheme}
				/>
				<SettingsModal
					visible={showSettings}
					onClose={onCloseSettings}
					includeLiveMuteToggle={true}
					isMuted={isMuted}
					onToggleMute={onToggleMute}
					muteMicByDefault={muteMicByDefault}
					onToggleMuteMicByDefault={onToggleMuteMicByDefault}
					autoStartVoice={autoStartVoice}
					onToggleAutoStartVoice={onToggleAutoStartVoice}
					showTranscript={showTranscript}
					onToggleShowTranscript={onToggleShowTranscript}
					themePreference={themePreference}
					resolvedTheme={resolvedTheme}
					onSetThemePreference={onSetThemePreference}
				/>

				{/* Input Request Modal */}
				<InputPromptModal
					request={inputRequest}
					onSubmit={onInputSubmit}
					onCancel={onInputCancel}
					resolvedTheme={resolvedTheme}
				/>

				{/* Form Request Modal */}
				<FormModal
					request={formRequest}
					onSubmit={onFormSubmit}
					onCancel={onFormCancel}
					onDismiss={onFormDismiss}
					resolvedTheme={resolvedTheme}
				/>

				{/* File Request Modal */}
				<FileRequestModal
					request={fileRequest}
					onUpload={onFileUpload}
					onCancel={onFileCancel}
					resolvedTheme={resolvedTheme}
				/>
			</KeyboardAvoidingView>
		</GestureHandlerRootView>
	);
};
