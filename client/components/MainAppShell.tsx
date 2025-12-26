import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ScrollView } from "react-native";
import { Keyboard } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useCall } from "../context/CallContext";
import { useSettings } from "../context/SettingsContext";
import { useTasks } from "../context/TasksContext";
import { useUI } from "../context/UIContext";
import { useKeyboardOffset } from "../hooks/useKeyboardOffset";
import { ActiveScreen } from "../screens/ActiveScreen";
import { IdleScreen } from "../screens/IdleScreen";
import { LoadingScreen } from "../screens/LoadingScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { WorkerStartScreen } from "../screens/WorkerStartScreen";

export const MainAppShell = () => {
	const scrollRef = useRef<ScrollView>(null);
	const inputAreaStyle = useKeyboardOffset(scrollRef);
	const {
		authStatus,
		savedServer,
		hasSavedCredentials,
		logout,
		pairingClaim,
		pairingServerUrl,
		startPairing,
		confirmPairing,
		resetPairing,
		checkAuth,
	} = useAuth();
	const {
		showDropdown,
		setShowDropdown,
		showWorkerInfo,
		setShowWorkerInfo,
		showSettings,
		setShowSettings,
		expandedTaskId,
		setExpandedTaskId,
		selectedTask,
		setSelectedTask,
		textInput,
		setTextInput,
		errorMessage,
		uiStepOverride,
		setUiStepOverride,
	} = useUI();
	const {
		autoStartVoice,
		muteMicByDefault,
		showTranscript,
		toggleAutoStartVoice,
		toggleMuteMicByDefault,
		toggleShowTranscript,
		themePreference,
		resolvedTheme,
		setThemePreference,
	} = useSettings();
	const {
		tasks,
		tasksById,
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
	} = useTasks();
	const {
		callStatus,
		callState,
		isMuted,
		isSpeakerEnabled,
		isStarting,
		connect,
		disconnect,
		toggleMute,
		toggleSpeaker,
	} = useCall();

	useEffect(() => {
		scrollRef.current?.scrollToEnd({ animated: true });
	}, []);

	const logSessionContext = useCallback(() => {
		console.log("\n========== SESSION CONTEXT DEBUG ==========\n");

		console.log("=== AMP SESSION CONTEXT ===");
		console.log("Tasks:", JSON.stringify(tasksById, null, 2));
		console.log("Content Cards:", JSON.stringify(contentCards, null, 2));
		console.log(
			"Pending Inputs:",
			JSON.stringify(Array.from(pendingInputsByTask.entries()), null, 2),
		);

		console.log("\n=== VOICE AGENT SESSION CONTEXT ===");
		console.log("Call State:", callState);
		console.log("Call Status:", callStatus);
		console.log("Is Muted:", isMuted);
		console.log("Streaming Response:", streamingResponse);
		console.log("Timeline:", JSON.stringify(timeline, null, 2));

		console.log("\n============================================\n");
	}, [
		tasksById,
		contentCards,
		pendingInputsByTask,
		callState,
		callStatus,
		isMuted,
		streamingResponse,
		timeline,
	]);

	useEffect(() => {
		const globalContext = globalThis as typeof globalThis & {
			logSessionContext?: typeof logSessionContext;
		};
		globalContext.logSessionContext = logSessionContext;
		return () => {
			delete globalContext.logSessionContext;
		};
	}, [logSessionContext]);

	const defaultStep = useMemo(() => {
		if (authStatus === "loading") return "loading";
		if (authStatus === "unpaired") return "pairing";
		if (workerJoined && !workerConnected) return "runWorker";
		if (callStatus === "connected") return "active";
		if (callStatus === "connecting" || isStarting) return "connecting";
		if (!workerJoined) return "joining";
		return "idle";
	}, [authStatus, callStatus, isStarting, workerJoined, workerConnected]);

	const effectiveStep =
		uiStepOverride === "pairing" ||
		uiStepOverride === "joining" ||
		uiStepOverride === "runWorker" ||
		uiStepOverride === "idle" ||
		uiStepOverride === "active" ||
		uiStepOverride === "connecting" ||
		uiStepOverride === "reconnecting"
			? uiStepOverride
			: defaultStep;

	useEffect(() => {
		if (
			authStatus === "unpaired" &&
			uiStepOverride &&
			uiStepOverride !== "pairing"
		) {
			setUiStepOverride("pairing");
			return;
		}
		if (workerConnected && uiStepOverride === "runWorker") {
			setUiStepOverride(null);
			return;
		}
		if (workerJoined && uiStepOverride === "joining") {
			setUiStepOverride("reconnecting");
		}
	}, [
		authStatus,
		uiStepOverride,
		workerConnected,
		setUiStepOverride,
		workerJoined,
	]);

	const handleToggleDropdown = () => setShowDropdown(!showDropdown);

	const handleOpenWorkerInfo = () => {
		setShowDropdown(false);
		setShowWorkerInfo(true);
	};

	const handleCloseWorkerInfo = () => setShowWorkerInfo(false);

	const handleOpenSettings = () => {
		setShowDropdown(false);
		setShowSettings(true);
	};

	const handleCloseSettings = () => setShowSettings(false);

	const handleLogout = async () => {
		setShowDropdown(false);
		await logout();
		await disconnect();
		resetRealtimeState();
	};

	const handleClearTasks = () => {
		setShowDropdown(false);
		clearTasks();
	};

	const handleEndSession = async () => {
		setShowDropdown(false);
		await disconnect();
		resetRealtimeState();
	};

	const handleDismissTask = (task: (typeof tasks)[number]) => {
		if (task.status === "running" || task.status === "pending") {
			broadcastSystemMessage(`Cancel task ${task.id}`, true, task.id);
		}
		removePendingTask(task.id);
	};

	const handleToggleTaskExpanded = (taskId: string) => {
		setExpandedTaskId(expandedTaskId === taskId ? null : taskId);
	};

	const handleTextSubmit = async () => {
		const text = textInput.trim();
		if (!text || callStatus !== "connected") return;
		Keyboard.dismiss();
		setTextInput("");
		await sendTextMessage(text);
	};

	const handleWorkerStartBack = () => {
		setUiStepOverride("reconnecting");
	};

	const handleBackToPairing = () => {
		setUiStepOverride("pairing");
	};

	const handleExitPairing = () => {
		setUiStepOverride(null);
	};

	if (effectiveStep === "loading") {
		return <LoadingScreen resolvedTheme={resolvedTheme} />;
	}

	if (effectiveStep === "pairing") {
		return (
			<OnboardingScreen
				errorMessage={errorMessage}
				pairingClaim={pairingClaim}
				pairingServerUrl={pairingServerUrl}
				savedServer={savedServer}
				hasSavedCredentials={hasSavedCredentials}
				forcePairing={authStatus === "authenticated"}
				resolvedTheme={resolvedTheme}
				onExitPairing={handleExitPairing}
				onLogout={handleLogout}
				onQuickLogin={checkAuth}
				onStartPairing={startPairing}
				onConfirmPairing={confirmPairing}
				onResetPairing={resetPairing}
			/>
		);
	}

	if (
		effectiveStep === "idle" ||
		effectiveStep === "joining" ||
		effectiveStep === "connecting" ||
		effectiveStep === "reconnecting"
	) {
		const isConnecting = callStatus === "connecting" || isStarting;

		if (
			effectiveStep === "runWorker" ||
			(workerJoined && !workerConnected && effectiveStep !== "reconnecting")
		) {
			return (
				<WorkerStartScreen
					onBack={handleWorkerStartBack}
					resolvedTheme={resolvedTheme}
				/>
			);
		}

		return (
			<IdleScreen
				isConnecting={isConnecting}
				workerConnected={workerConnected}
				errorMessage={errorMessage}
				showDropdown={showDropdown}
				onToggleDropdown={handleToggleDropdown}
				onConnect={connect}
				onBackToPairing={handleBackToPairing}
				onOpenWorkerInfo={handleOpenWorkerInfo}
				onCloseWorkerInfo={handleCloseWorkerInfo}
				onOpenSettings={handleOpenSettings}
				onCloseSettings={handleCloseSettings}
				showWorkerInfo={showWorkerInfo}
				showSettings={showSettings}
				workerId={workerId}
				workerWorkspace={workerWorkspace}
				muteMicByDefault={muteMicByDefault}
				autoStartVoice={autoStartVoice}
				showTranscript={showTranscript}
				onToggleMuteMicByDefault={toggleMuteMicByDefault}
				onToggleAutoStartVoice={toggleAutoStartVoice}
				onToggleShowTranscript={toggleShowTranscript}
				themePreference={themePreference}
				resolvedTheme={resolvedTheme}
				onSetThemePreference={setThemePreference}
			/>
		);
	}

	if (workerJoined && !workerConnected && effectiveStep !== "reconnecting") {
		return (
			<WorkerStartScreen
				onBack={handleWorkerStartBack}
				resolvedTheme={resolvedTheme}
			/>
		);
	}

	return (
		<ActiveScreen
			showDropdown={showDropdown}
			onToggleDropdown={handleToggleDropdown}
			onOpenWorkerInfo={handleOpenWorkerInfo}
			onOpenSettings={handleOpenSettings}
			onClearTasks={handleClearTasks}
			onEndSession={handleEndSession}
			callStatus={callStatus}
			isMuted={isMuted}
			isSpeakerEnabled={isSpeakerEnabled}
			onToggleMute={toggleMute}
			onToggleSpeaker={toggleSpeaker}
			showTranscript={showTranscript}
			streamingResponse={streamingResponse}
			userTranscript={userTranscript}
			pendingInputRequest={pendingInputRequest}
			onInputNeededPress={handleInputNeededPress}
			tasks={tasks}
			expandedTaskId={expandedTaskId}
			onToggleTaskExpanded={handleToggleTaskExpanded}
			onAutoExpandTask={setExpandedTaskId}
			onFadeCompleteTask={removePendingTask}
			onDismissTask={handleDismissTask}
			onBroadcastTask={(message, taskId) =>
				broadcastSystemMessage(message, false, taskId)
			}
			pendingInputsByTask={pendingInputsByTask}
			contentCards={contentCards}
			textInput={textInput}
			onChangeTextInput={setTextInput}
			onSubmitText={handleTextSubmit}
			inputAreaStyle={inputAreaStyle}
			scrollRef={scrollRef}
			selectedTask={selectedTask}
			onCloseTaskModal={() => setSelectedTask(null)}
			inputRequest={inputRequest}
			onInputSubmit={handleInputSubmit}
			onInputCancel={handleInputCancel}
			formRequest={formRequest}
			onFormSubmit={handleFormSubmit}
			onFormCancel={handleFormCancel}
			onFormDismiss={handleFormDismiss}
			fileRequest={fileRequest}
			onFileUpload={handleFileUpload}
			onFileCancel={handleFileCancel}
			showWorkerInfo={showWorkerInfo}
			showSettings={showSettings}
			workerConnected={workerConnected}
			workerId={workerId}
			workerWorkspace={workerWorkspace}
			onCloseWorkerInfo={handleCloseWorkerInfo}
			onCloseSettings={handleCloseSettings}
			muteMicByDefault={muteMicByDefault}
			autoStartVoice={autoStartVoice}
			onToggleMuteMicByDefault={toggleMuteMicByDefault}
			onToggleAutoStartVoice={toggleAutoStartVoice}
			onToggleShowTranscript={toggleShowTranscript}
			themePreference={themePreference}
			resolvedTheme={resolvedTheme}
			onSetThemePreference={setThemePreference}
		/>
	);
};
