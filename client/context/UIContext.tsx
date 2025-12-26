import type React from "react";
import { createContext, useContext, useState } from "react";
import type { TaskCard } from "../types/ui";

export type UIContextValue = {
	errorMessage: string | null;
	setErrorMessage: (message: string | null) => void;
	uiStepOverride: UIStep | null;
	setUiStepOverride: (step: UIStep | null) => void;
	showDropdown: boolean;
	setShowDropdown: (value: boolean) => void;
	showWorkerInfo: boolean;
	setShowWorkerInfo: (value: boolean) => void;
	showSettings: boolean;
	setShowSettings: (value: boolean) => void;
	expandedTaskId: string | null;
	setExpandedTaskId: (value: string | null) => void;
	selectedTask: TaskCard | null;
	setSelectedTask: (task: TaskCard | null) => void;
	textInput: string;
	setTextInput: (value: string) => void;
};

export type UIStep =
	| "pairing"
	| "joining"
	| "runWorker"
	| "idle"
	| "active"
	| "connecting"
	| "reconnecting";

const UIContext = createContext<UIContextValue | undefined>(undefined);

export const UIProvider = ({ children }: { children: React.ReactNode }) => {
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [uiStepOverride, setUiStepOverride] = useState<UIStep | null>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	const [showWorkerInfo, setShowWorkerInfo] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
	const [selectedTask, setSelectedTask] = useState<TaskCard | null>(null);
	const [textInput, setTextInput] = useState("");

	const value: UIContextValue = {
		errorMessage,
		setErrorMessage,
		uiStepOverride,
		setUiStepOverride,
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
	};

	return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

export const useUI = () => {
	const context = useContext(UIContext);
	if (!context) {
		throw new Error("useUI must be used within a UIProvider");
	}
	return context;
};
