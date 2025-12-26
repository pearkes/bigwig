import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MainAppShell } from "./components/MainAppShell";
import { AuthProvider } from "./context/AuthContext";
import { CallProvider } from "./context/CallContext";
import { SettingsProvider } from "./context/SettingsContext";
import { TasksProvider } from "./context/TasksContext";
import { UIProvider } from "./context/UIContext";

export default function App() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SettingsProvider>
				<UIProvider>
					<AuthProvider>
						<TasksProvider>
							<CallProvider>
								<MainAppShell />
							</CallProvider>
						</TasksProvider>
					</AuthProvider>
				</UIProvider>
			</SettingsProvider>
		</GestureHandlerRootView>
	);
}
