import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { memo, useCallback, useMemo, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
	Platform,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ThemeMode } from "../theme/theme";
import type { ContentCard } from "../types/tasks";

// Copy button with checkmark confirmation
const CopyButton = memo(
	({
		text,
		buttonStyle,
		iconColor,
		activeColor,
	}: {
		text: string;
		buttonStyle: StyleProp<ViewStyle>;
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
				style={buttonStyle}
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

const MAX_CONTAINER_HEIGHT = 400;

const createHeightMeasureScript = (maxHeight: number) => `
  (function() {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    
    const measure = () => {
      const content = document.body.firstElementChild || document.body;
      const rect = content.getBoundingClientRect();
      const h = Math.ceil(rect.height) || document.body.scrollHeight;
      const w = document.body.scrollWidth;
      const containerH = ${maxHeight};
      const containerW = window.innerWidth;
      
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: h }));
      
      if (h > containerH || w > containerW) {
        const scaleH = containerH / h;
        const scaleW = containerW / w;
        const scale = Math.min(scaleH, scaleW, 1);
        
        document.body.style.transformOrigin = 'top left';
        document.body.style.transform = 'scale(' + scale + ')';
      }
    };
    
    if (document.readyState === 'complete') {
      setTimeout(measure, 50);
    } else {
      window.addEventListener('load', () => setTimeout(measure, 50));
    }
  })();
  true;
`;

export const MessageCard = ({
	event,
	resolvedTheme,
}: {
	event: Extract<ContentCard, { type: "message" }>;
	resolvedTheme: ThemeMode;
}) => {
	const format = event.format || "plain";
	const [webViewHeight, setWebViewHeight] = useState<number | null>(null);
	const styles = useMemo(
		() => getContentCardStyles(resolvedTheme),
		[resolvedTheme],
	);
	const markdownStyles = useMemo(
		() => getContentMarkdownStyles(resolvedTheme),
		[resolvedTheme],
	);
	const isDark = resolvedTheme === "dark";
	const iconColor = isDark ? "#f5f5f5" : "#333";
	const activeIconColor = "#4CAF50";

	const handleMessage = useCallback((e: WebViewMessageEvent) => {
		try {
			const data = JSON.parse(e.nativeEvent.data);
			if (data.type === "height" && typeof data.height === "number") {
				setWebViewHeight(Math.min(data.height + 16, MAX_CONTAINER_HEIGHT));
			}
		} catch {}
	}, []);

	if (format === "html") {
		return (
			<WebView
				source={{ html: event.text }}
				style={[
					styles.htmlWebView,
					webViewHeight !== null && { height: webViewHeight },
				]}
				scrollEnabled={false}
				originWhitelist={["*"]}
				javaScriptEnabled={true}
				injectedJavaScript={createHeightMeasureScript(MAX_CONTAINER_HEIGHT)}
				onMessage={handleMessage}
			/>
		);
	}

	if (format === "markdown") {
		const displayText = event.text.replace(/\\n/g, "\n");
		return (
			<View style={styles.textContent}>
				{event.title && (
					<Text style={styles.cardTitle} selectable>
						{event.title}
					</Text>
				)}
				<Markdown style={markdownStyles}>{displayText}</Markdown>
				<View style={styles.textActions}>
					<CopyButton
						text={event.text}
						buttonStyle={styles.textActionButton}
						iconColor={iconColor}
						activeColor={activeIconColor}
					/>
					<TouchableOpacity
						style={styles.textActionButton}
						onPress={() => Share.share({ message: event.text })}
						hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
					>
						<Ionicons name="share-outline" size={18} color={iconColor} />
					</TouchableOpacity>
				</View>
			</View>
		);
	}

	const displayText = event.text.replace(/\\n/g, "\n");

	return (
		<View style={styles.textContent}>
			{event.title && (
				<Text style={styles.cardTitle} selectable>
					{event.title}
				</Text>
			)}
			<Text style={styles.cardText} selectable>
				{displayText}
			</Text>
			<View style={styles.textActions}>
				<CopyButton
					text={displayText}
					buttonStyle={styles.textActionButton}
					iconColor={iconColor}
					activeColor={activeIconColor}
				/>
				<TouchableOpacity
					style={styles.textActionButton}
					onPress={() => Share.share({ message: displayText })}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="share-outline" size={18} color={iconColor} />
				</TouchableOpacity>
			</View>
		</View>
	);
};

export const ErrorCard = ({
	event,
	resolvedTheme,
}: {
	event: Extract<ContentCard, { type: "error" }>;
	resolvedTheme: ThemeMode;
}) => {
	const styles = useMemo(
		() => getContentCardStyles(resolvedTheme),
		[resolvedTheme],
	);
	return (
		<View style={styles.errorCard}>
			<Text style={styles.errorMessage}>{event.message}</Text>
			{event.suggestion && (
				<Text style={styles.errorSuggestion}>{event.suggestion}</Text>
			)}
		</View>
	);
};

interface ContentCardRendererProps {
	event: ContentCard;
	resolvedTheme: ThemeMode;
}

export const ContentCardRenderer = ({
	event,
	resolvedTheme,
}: ContentCardRendererProps) => {
	switch (event.type) {
		case "message":
			return <MessageCard event={event} resolvedTheme={resolvedTheme} />;
		case "error":
			return <ErrorCard event={event} resolvedTheme={resolvedTheme} />;
		default:
			return null;
	}
};

const getContentCardStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		title: isDark ? "#f5f5f5" : "#000",
		text: isDark ? "#e0e0e0" : "#333",
		errorBg: isDark ? "rgba(60, 20, 20, 0.85)" : "rgba(255, 245, 245, 0.95)",
		errorBorder: isDark ? "rgba(255, 107, 107, 0.2)" : "rgba(244, 67, 54, 0.2)",
		errorText: isDark ? "#ff6b6b" : "#c62828",
		errorSuggestion: isDark ? "#bdbdbd" : "#666",
	};

	return StyleSheet.create({
		textContent: {
			padding: 4,
		},
		cardTitle: {
			fontSize: 15,
			fontWeight: "600",
			color: colors.title,
			marginBottom: 6,
		},
		cardText: {
			fontSize: 14,
			color: colors.text,
			lineHeight: 20,
		},
		textActions: {
			flexDirection: "row",
			justifyContent: "flex-end",
			gap: 12,
			marginTop: 8,
		},
		textActionButton: {
			padding: 2,
		},
		errorCard: {
			backgroundColor: colors.errorBg,
			borderRadius: 12,
			padding: 14,
			marginBottom: 8,
			borderWidth: 1,
			borderColor: colors.errorBorder,
		},
		errorMessage: {
			fontSize: 14,
			color: colors.errorText,
			fontWeight: "500",
		},
		errorSuggestion: {
			fontSize: 13,
			color: colors.errorSuggestion,
			marginTop: 6,
		},
		htmlWebView: {
			width: "100%",
			height: 50,
			backgroundColor: "transparent",
		},
	});
};

const getContentMarkdownStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		text: isDark ? "#e0e0e0" : "#333",
		codeBg: isDark ? "#111" : "#f0f0f0",
		link: isDark ? "#7fb7ff" : "#007AFF",
	};

	return StyleSheet.create({
		body: {
			fontSize: 14,
			color: colors.text,
			lineHeight: 20,
		},
		paragraph: {
			marginTop: 8,
			marginBottom: 8,
			flexWrap: "wrap",
			flexDirection: "row",
			alignItems: "flex-start",
			justifyContent: "flex-start",
			width: "100%",
		},
		heading1: {
			fontSize: 18,
			fontWeight: "600",
			marginTop: 14,
			marginBottom: 8,
			flexDirection: "row",
		},
		heading2: {
			fontSize: 16,
			fontWeight: "600",
			marginTop: 12,
			marginBottom: 6,
			flexDirection: "row",
		},
		heading3: {
			fontSize: 15,
			fontWeight: "600",
			marginTop: 10,
			marginBottom: 4,
			flexDirection: "row",
		},
		code_inline: {
			backgroundColor: colors.codeBg,
			paddingHorizontal: 4,
			paddingVertical: 2,
			borderRadius: 3,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
			fontSize: 13,
		},
		fence: {
			backgroundColor: colors.codeBg,
			padding: 10,
			borderRadius: 6,
			marginVertical: 8,
			fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
			fontSize: 13,
		},
		bullet_list: {
			marginTop: 6,
			marginBottom: 6,
		},
		ordered_list: {
			marginTop: 6,
			marginBottom: 6,
		},
		list_item: {
			flexDirection: "row",
			justifyContent: "flex-start",
			marginVertical: 2,
		},
		link: {
			color: colors.link,
		},
	});
};
