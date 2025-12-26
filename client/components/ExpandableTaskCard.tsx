import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
	Platform,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Animated, {
	Easing,
	Extrapolation,
	FadeIn,
	FadeOut,
	interpolate,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import {
	PENDING_TASK_FADE_MS,
	PENDING_TASK_TIMEOUT_MS,
} from "../constants/timeouts";
import type { ThemeMode } from "../theme/theme";
import type { ContentCard, Task, ToolInvocation } from "../types/tasks";
import type { PendingInputRequest, TaskCard } from "../types/ui";
import {
	isTaskActive,
	isTaskCancelled,
	isTaskCompleted,
	isTaskPending,
} from "../utils/taskHelpers";
import { ContentCardRenderer } from "./ContentCards";
import { SwipeableDismiss } from "./SwipeableDismiss";
import { getToolDisplay } from "./toolLabels";

type ExpandableTaskCardStyles = ReturnType<typeof getExpandableTaskCardStyles>;

interface ExpandableTaskCardProps {
	task: TaskCard;
	index: number;
	isExpanded: boolean;
	onPress: () => void;
	onDismiss: () => void;
	onBroadcast?: (message: string) => void;
	onFadeComplete?: () => void;
	onAutoExpand?: (taskId: string) => void;
	pendingInput?: PendingInputRequest;
	onInputNeededPress?: (pending: PendingInputRequest) => void;
	contentCards?: ContentCard[];
	resolvedTheme: ThemeMode;
}

const isTaskRunning = (status: Task["status"]) => status === "running";

const ToolHistoryItem = memo(
	({
		tool,
		styles,
	}: {
		tool: ToolInvocation;
		styles: ExpandableTaskCardStyles;
	}) => {
		const [isExpanded, setIsExpanded] = useState(false);
		const durationMs = tool.completed_at
			? tool.completed_at - tool.started_at
			: 0;
		const durationSec = (durationMs / 1000).toFixed(1);
		const displayLabel = getToolDisplay(tool.name, tool.input);

		return (
			<TouchableOpacity
				style={styles.toolHistoryItem}
				onPress={() => setIsExpanded(!isExpanded)}
				activeOpacity={0.7}
			>
				<View style={styles.toolHistoryDot} />
				<Text
					style={styles.toolHistoryName}
					numberOfLines={isExpanded ? undefined : 1}
				>
					{displayLabel}
				</Text>
				{tool.completed_at && (
					<Text style={styles.toolHistoryDuration}>{durationSec}s</Text>
				)}
			</TouchableOpacity>
		);
	},
);

// Copy button with checkmark confirmation
const CopyButton = memo(
	({
		text,
		styles,
		iconColor,
		activeColor,
	}: {
		text: string;
		styles: ExpandableTaskCardStyles;
		iconColor: string;
		activeColor: string;
	}) => {
		const [copied, setCopied] = useState(false);

		const handleCopy = useCallback(async () => {
			await Clipboard.setStringAsync(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}, [text]);

		return (
			<TouchableOpacity
				style={styles.textActionButton}
				onPress={handleCopy}
				hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
			>
				<Ionicons
					name={copied ? "checkmark" : "copy-outline"}
					size={18}
					color={copied ? activeColor : iconColor}
				/>
			</TouchableOpacity>
		);
	},
);

// Animated pulsing border for loading state
const PulsingBorder = memo(
	({
		isActive,
		styles,
	}: {
		isActive: boolean;
		styles: ExpandableTaskCardStyles;
	}) => {
		const pulseOpacity = useSharedValue(0.3);

		useEffect(() => {
			if (isActive) {
				pulseOpacity.value = withRepeat(
					withSequence(
						withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
						withTiming(0.3, {
							duration: 800,
							easing: Easing.inOut(Easing.ease),
						}),
					),
					-1,
					false,
				);
			} else {
				pulseOpacity.value = withTiming(0, { duration: 200 });
			}
		}, [isActive, pulseOpacity]);

		const animatedStyle = useAnimatedStyle(() => ({
			opacity: pulseOpacity.value,
		}));

		if (!isActive) return null;

		return <Animated.View style={[styles.pulsingBorder, animatedStyle]} />;
	},
);

export const ExpandableTaskCard = memo(
	({
		task,
		index,
		isExpanded,
		onPress,
		onDismiss,
		onBroadcast,
		onFadeComplete,
		onAutoExpand,
		pendingInput,
		onInputNeededPress,
		contentCards = [],
		resolvedTheme,
	}: ExpandableTaskCardProps) => {
		const styles = useMemo(
			() => getExpandableTaskCardStyles(resolvedTheme),
			[resolvedTheme],
		);
		const isDark = resolvedTheme === "dark";
		const iconColor = isDark ? "#f5f5f5" : "#333";
		const activeIconColor = "#4CAF50";
		const chevronColor = isDark ? "#9c9c9c" : "#888";
		const infoColor = isDark ? "#bdbdbd" : "#999";
		const shareIconColor = iconColor;
		// Local timer for active tasks - updates every 100ms for smooth display
		const [localNow, setLocalNow] = useState(Date.now());
		useEffect(() => {
			if (isTaskActive(task.status)) {
				const interval = setInterval(() => setLocalNow(Date.now()), 100);
				return () => clearInterval(interval);
			}
		}, [task.status]);

		const elapsed = isTaskActive(task.status)
			? localNow - task.startTime.getTime()
			: task.durationMs || task.duration_ms || 0;
		const elapsedSecs = (elapsed / 1000).toFixed(1);
		const displayResult = task.result || task.result_text;

		// Filter content cards to only show those belonging to this task
		const taskContentCards = contentCards.filter(
			(card) => card.task_id === task.id,
		);

		// Check if this pending task should fade out
		const isPendingStale =
			task.id.startsWith("pending_") &&
			task.status === "pending" &&
			localNow - task.startTime.getTime() > PENDING_TASK_TIMEOUT_MS;

		const opacity = useSharedValue(1);
		const expandProgress = useSharedValue(isExpanded ? 1 : 0);

		useEffect(() => {
			if (isPendingStale) {
				opacity.value = withTiming(
					0,
					{ duration: PENDING_TASK_FADE_MS },
					(finished) => {
						if (finished && onFadeComplete) {
							runOnJS(onFadeComplete)();
						}
					},
				);
			}
		}, [isPendingStale, onFadeComplete, opacity]);

		useEffect(() => {
			expandProgress.value = withTiming(isExpanded ? 1 : 0, { duration: 300 });
		}, [isExpanded, expandProgress]);

		const animatedStyle = useAnimatedStyle(() => ({
			opacity: opacity.value,
		}));

		const expandedContentStyle = useAnimatedStyle(() => ({
			opacity: expandProgress.value,
			maxHeight: interpolate(
				expandProgress.value,
				[0, 1],
				[0, 1000],
				Extrapolation.CLAMP,
			),
		}));

		const chevronStyle = useAnimatedStyle(() => ({
			transform: [
				{
					rotate: `${interpolate(expandProgress.value, [0, 1], [0, 180])}deg`,
				},
			],
		}));

		const hasContent =
			taskContentCards.length > 0 ||
			displayResult ||
			task.tool_history.length > 0;

		const cardContent = (
			<View style={styles.cardWrapper}>
				{/* Pulsing border for running state */}
				<PulsingBorder isActive={isTaskRunning(task.status)} styles={styles} />

				<View
					style={[
						styles.taskCard,
						isTaskPending(task.status) && styles.taskCardPending,
						isTaskRunning(task.status) && styles.taskCardRunning,
						isTaskCompleted(task.status) && styles.taskCardCompleted,
						isTaskCancelled(task.status) && styles.taskCardCancelled,
						pendingInput && styles.taskCardInputNeeded,
						isExpanded && styles.taskCardExpanded,
					]}
				>
					{/* For completed tasks: content-first layout */}
					{isTaskCompleted(task.status) ? (
						<>
							{/* Top half: Content (always visible) */}
							{taskContentCards.length > 0 ? (
								taskContentCards.map((card) => {
									const isHtml =
										card.type === "message" && card.format === "html";
									return (
										<View
											key={card.id}
											style={
												isHtml
													? styles.htmlContentSection
													: styles.contentSection
											}
										>
											<ContentCardRenderer
												event={card}
												resolvedTheme={resolvedTheme}
											/>
										</View>
									);
								})
							) : displayResult ? (
								<View style={styles.contentSection}>
									<Text style={styles.resultText} selectable>
										{displayResult}
									</Text>
									<View style={styles.textActions}>
										<CopyButton
											text={displayResult}
											styles={styles}
											iconColor={iconColor}
											activeColor={activeIconColor}
										/>
										<TouchableOpacity
											style={styles.textActionButton}
											onPress={() => Share.share({ message: displayResult })}
											hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
										>
											<Ionicons
												name="share-outline"
												size={18}
												color={shareIconColor}
											/>
										</TouchableOpacity>
									</View>
								</View>
							) : (
								<View style={styles.contentSection}>
									<View style={styles.emptyState}>
										<Ionicons
											name="checkmark-circle-outline"
											size={24}
											color={activeIconColor}
										/>
										<Text style={styles.emptyStateText}>Completed</Text>
									</View>
								</View>
							)}

							{/* Bottom half: Task details (collapsible) */}
							<TouchableOpacity onPress={onPress} activeOpacity={0.7}>
								<View style={styles.taskRefRow}>
									<Text style={styles.taskRefText} numberOfLines={1}>
										{typeof task.task === "string"
											? task.task
											: task.description}
									</Text>
									<Text style={styles.taskRefTime}>{elapsedSecs}s</Text>
									{hasContent && (
										<Animated.View style={chevronStyle}>
											<Ionicons
												name="chevron-down"
												size={12}
												color={chevronColor}
											/>
										</Animated.View>
									)}
								</View>
							</TouchableOpacity>

							{/* Expandable details section */}
							<Animated.View
								style={[styles.expandedContent, expandedContentStyle]}
							>
								{isExpanded && (
									<>
										{/* Result text (when content cards are shown above) */}
										{taskContentCards.length > 0 && displayResult && (
											<View style={styles.resultSection}>
												<Text style={styles.sectionTitle}>Response</Text>
												<Text style={styles.resultText} selectable>
													{displayResult}
												</Text>
											</View>
										)}

										{/* Tool history */}
										{task.tool_history.length > 0 && (
											<View style={styles.historySection}>
												<Text style={styles.sectionTitle}>Activity</Text>
												{task.tool_history.map((tool, i) => (
													<ToolHistoryItem
														key={`${tool.name}-${i}`}
														tool={tool}
														styles={styles}
													/>
												))}
											</View>
										)}
									</>
								)}
							</Animated.View>
						</>
					) : (
						<>
							{/* For running/pending/cancelled: task-first layout */}
							<View style={styles.taskCardHeader}>
								<Text
									style={[
										styles.taskCardTitle,
										isTaskPending(task.status) && styles.taskCardTitlePending,
										isTaskCancelled(task.status) &&
											styles.taskCardTitleCancelled,
									]}
									numberOfLines={isExpanded ? undefined : 1}
								>
									{typeof task.task === "string"
										? task.task
										: typeof task.description === "string"
											? task.description
											: "Task"}
								</Text>
								<Text
									style={[
										styles.taskCardTime,
										isTaskRunning(task.status) && styles.taskCardTimeActive,
									]}
								>
									{elapsedSecs}s
								</Text>
								{hasContent && (
									<Animated.View style={chevronStyle}>
										<Ionicons
											name="chevron-down"
											size={12}
											color={chevronColor}
										/>
									</Animated.View>
								)}
							</View>

							{/* Pending text */}
							{isTaskPending(task.status) && !isExpanded && (
								<Animated.Text
									style={styles.taskCardPendingText}
									entering={FadeIn.duration(200)}
									exiting={FadeOut.duration(150)}
								>
									Waiting for response...
								</Animated.Text>
							)}

							{/* Current tool or starting state */}
							{isTaskRunning(task.status) && !isExpanded && (
								<Animated.Text
									style={styles.taskCardTool}
									entering={FadeIn.duration(200)}
									exiting={FadeOut.duration(150)}
									numberOfLines={1}
								>
									{task.current_tool
										? getToolDisplay(task.current_tool)
										: "Starting…"}
								</Animated.Text>
							)}

							{/* Expanded content for non-completed tasks */}
							<Animated.View
								style={[styles.expandedContent, expandedContentStyle]}
							>
								{isExpanded && (
									<>
										{taskContentCards.length > 0 && (
											<View style={styles.contentSection}>
												{taskContentCards.map((card) => (
													<ContentCardRenderer
														key={card.id}
														event={card}
														resolvedTheme={resolvedTheme}
													/>
												))}
											</View>
										)}

										{task.tool_history.length > 0 && (
											<View style={styles.historySection}>
												<Text style={styles.sectionTitle}>Activity</Text>
												{task.tool_history.map((tool, i) => (
													<ToolHistoryItem
														key={`${tool.name}-${i}`}
														tool={tool}
														styles={styles}
													/>
												))}
											</View>
										)}

										{taskContentCards.length === 0 &&
											task.tool_history.length === 0 &&
											!displayResult && (
												<View style={styles.contentSection}>
													<View style={styles.emptyState}>
														<Ionicons
															name="information-circle-outline"
															size={22}
															color={infoColor}
														/>
														<Text style={styles.emptyStateTextMuted}>
															No updates yet
														</Text>
													</View>
												</View>
											)}
									</>
								)}
							</Animated.View>
						</>
					)}

					{/* Pending input button */}
					{pendingInput && (
						<TouchableOpacity
							style={styles.inputNeededRow}
							onPress={() => onInputNeededPress?.(pendingInput)}
							activeOpacity={0.7}
						>
							<Text style={styles.inputNeededIcon}>
								{pendingInput.kind === "input"
									? "✏️"
									: pendingInput.kind === "form"
										? "📋"
										: "📎"}
							</Text>
							<Text style={styles.inputNeededPrompt} numberOfLines={1}>
								{pendingInput.kind === "input"
									? pendingInput.request.prompt
									: pendingInput.kind === "form"
										? pendingInput.request.form?.title ||
											pendingInput.request.prompt ||
											"Form required"
										: pendingInput.request.prompt}
							</Text>
							<View style={styles.inputNeededButton}>
								<Text style={styles.inputNeededButtonText}>Input needed</Text>
							</View>
						</TouchableOpacity>
					)}
				</View>
			</View>
		);

		return (
			<SwipeableDismiss onDismiss={onDismiss} onBroadcast={onBroadcast}>
				<Animated.View
					style={[index > 0 && styles.taskCardStacked, animatedStyle]}
				>
					{isTaskCompleted(task.status) ? (
						cardContent
					) : (
						<TouchableOpacity onPress={onPress} activeOpacity={0.7}>
							{cardContent}
						</TouchableOpacity>
					)}
				</Animated.View>
			</SwipeableDismiss>
		);
	},
);

const getExpandableTaskCardStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		pulse: isDark ? "#7fb7ff" : "#007AFF",
		cardBg: isDark ? "rgba(20, 20, 20, 0.92)" : "rgba(255, 255, 255, 0.92)",
		cardBorder: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
		pendingBg: isDark ? "rgba(18, 18, 18, 0.92)" : "rgba(250, 250, 250, 0.92)",
		pendingBorder: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)",
		runningBg: isDark ? "rgba(18, 18, 18, 0.95)" : "rgba(255, 255, 255, 0.95)",
		completedBg: isDark
			? "rgba(16, 16, 16, 0.92)"
			: "rgba(255, 255, 255, 0.92)",
		completedBorder: "rgba(76, 175, 80, 0.25)",
		cancelledBg: isDark ? "rgba(45, 20, 20, 0.9)" : "rgba(255, 250, 250, 0.92)",
		cancelledBorder: isDark
			? "rgba(255, 107, 107, 0.2)"
			: "rgba(244, 67, 54, 0.15)",
		inputNeededBg: isDark ? "rgba(255, 184, 0, 0.12)" : "#FFFDF5",
		inputNeededBorder: "#FFB800",
		expandedBg: isDark ? "#111" : "#fff",
		text: isDark ? "#f5f5f5" : "#333",
		textMuted: isDark ? "#9c9c9c" : "#888",
		textMuted2: isDark ? "#bdbdbd" : "#999",
		textCancelled: isDark ? "#8c8c8c" : "#999",
		toolActive: isDark ? "#7fb7ff" : "#007AFF",
		resultText: isDark ? "#e0e0e0" : "#333",
		sectionBorder: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
		refBorder: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
		emptyMuted: isDark ? "#9c9c9c" : "#888",
		inputNeededText: isDark ? "#f5f5f5" : "#333",
		inputNeededButtonText: isDark ? "#111" : "#fff",
		toolHistoryName: isDark ? "#f5f5f5" : "#333",
		toolHistoryDuration: isDark ? "#9c9c9c" : "#888",
	};

	return StyleSheet.create({
		cardWrapper: {
			position: "relative",
		},
		pulsingBorder: {
			position: "absolute",
			top: -2,
			left: -2,
			right: -2,
			bottom: -2,
			borderRadius: 18,
			borderWidth: 2,
			borderColor: colors.pulse,
		},
		taskCard: {
			borderRadius: 16,
			backgroundColor: colors.cardBg,
			borderWidth: 1,
			borderColor: colors.cardBorder,
			overflow: "hidden",
		},
		taskCardPending: {
			backgroundColor: colors.pendingBg,
			borderColor: colors.pendingBorder,
			borderStyle: "dashed",
		},
		taskCardRunning: {
			backgroundColor: colors.runningBg,
			borderColor: "transparent",
			borderWidth: 2,
		},
		taskCardCompleted: {
			backgroundColor: colors.completedBg,
			borderColor: colors.completedBorder,
			borderWidth: 1,
		},
		taskCardCancelled: {
			backgroundColor: colors.cancelledBg,
			borderColor: colors.cancelledBorder,
		},
		taskCardInputNeeded: {
			borderColor: colors.inputNeededBorder,
			borderWidth: 2,
			backgroundColor: colors.inputNeededBg,
		},
		taskCardExpanded: {
			backgroundColor: colors.expandedBg,
		},
		taskCardStacked: {
			marginTop: -4,
		},
		taskCardHeader: {
			flexDirection: "row",
			alignItems: "center",
			gap: 8,
			padding: 14,
			paddingBottom: 0,
		},
		taskCardTitle: {
			flex: 1,
			fontSize: 14,
			fontWeight: "500",
			color: colors.text,
		},
		taskCardTitlePending: {
			color: colors.textMuted,
		},
		taskCardTitleCancelled: {
			color: colors.textCancelled,
			textDecorationLine: "line-through",
		},
		taskCardTime: {
			fontSize: 12,
			color: colors.textMuted,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
		},
		taskCardTimeActive: {
			color: colors.toolActive,
		},
		chevronWrapper: {
			marginLeft: 4,
		},
		taskCardPendingText: {
			fontSize: 12,
			color: colors.textMuted2,
			paddingHorizontal: 14,
			paddingBottom: 14,
			fontStyle: "italic",
		},
		taskCardTool: {
			fontSize: 12,
			color: colors.toolActive,
			paddingHorizontal: 14,
			paddingBottom: 14,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
		},
		taskCardResult: {
			fontSize: 13,
			color: colors.textMuted,
			marginTop: 6,
			lineHeight: 18,
		},
		taskRefRow: {
			flexDirection: "row",
			alignItems: "center",
			padding: 14,
			paddingTop: 10,
			borderTopWidth: 1,
			borderTopColor: colors.refBorder,
			gap: 8,
		},
		taskRefText: {
			flex: 1,
			fontSize: 12,
			color: colors.textMuted,
		},
		taskRefTime: {
			fontSize: 11,
			color: colors.textMuted2,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
		},
		expandedContent: {
			overflow: "hidden",
		},
		contentSection: {
			padding: 14,
			gap: 8,
		},
		htmlContentSection: {},
		resultSection: {
			padding: 14,
			paddingTop: 12,
			borderTopWidth: 1,
			borderTopColor: colors.sectionBorder,
		},
		historySection: {
			padding: 14,
			paddingTop: 12,
			borderTopWidth: 1,
			borderTopColor: colors.sectionBorder,
		},
		sectionTitle: {
			fontSize: 11,
			fontWeight: "600",
			color: colors.textMuted,
			textTransform: "uppercase",
			letterSpacing: 0.5,
			marginBottom: 8,
		},
		resultText: {
			fontSize: 14,
			color: colors.resultText,
			lineHeight: 20,
		},
		textActions: {
			flexDirection: "row",
			justifyContent: "flex-end",
			gap: 12,
			marginTop: 6,
		},
		textActionButton: {
			padding: 2,
		},
		emptyState: {
			flexDirection: "row",
			alignItems: "center",
			gap: 8,
			paddingVertical: 4,
		},
		emptyStateText: {
			fontSize: 14,
			color: "#4CAF50",
			fontWeight: "500",
		},
		emptyStateTextMuted: {
			fontSize: 14,
			color: colors.emptyMuted,
			fontWeight: "500",
		},
		toolHistoryItem: {
			flexDirection: "row",
			alignItems: "flex-start",
			paddingVertical: 4,
			gap: 8,
		},
		toolHistoryDot: {
			width: 6,
			height: 6,
			borderRadius: 3,
			backgroundColor: colors.toolActive,
			marginTop: 5,
		},
		toolHistoryName: {
			flex: 1,
			fontSize: 13,
			color: colors.toolHistoryName,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
		},
		toolHistoryDuration: {
			fontSize: 11,
			color: colors.toolHistoryDuration,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
			marginTop: 2,
		},
		inputNeededRow: {
			flexDirection: "row",
			alignItems: "center",
			padding: 14,
			paddingTop: 10,
			borderTopWidth: 1,
			borderTopColor: colors.inputNeededBorder,
			gap: 8,
		},
		inputNeededIcon: {
			fontSize: 16,
		},
		inputNeededPrompt: {
			flex: 1,
			fontSize: 13,
			color: colors.inputNeededText,
		},
		inputNeededButton: {
			backgroundColor: colors.inputNeededBorder,
			paddingHorizontal: 12,
			paddingVertical: 6,
			borderRadius: 12,
		},
		inputNeededButtonText: {
			color: colors.inputNeededButtonText,
			fontSize: 12,
			fontWeight: "600",
		},
	});
};
