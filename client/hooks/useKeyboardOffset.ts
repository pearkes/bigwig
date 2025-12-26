import type { RefObject } from "react";
import { useEffect } from "react";
import type { KeyboardEvent, ScrollView } from "react-native";
import { Keyboard, Platform } from "react-native";
import {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

export const useKeyboardOffset = (scrollRef: RefObject<ScrollView>) => {
	const keyboardOffset = useSharedValue(0);

	const inputAreaStyle = useAnimatedStyle(() => ({
		marginBottom: interpolate(keyboardOffset.value, [-300, 0], [8, 32]),
	}));

	useEffect(() => {
		const showSub = Keyboard.addListener(
			Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
			(e: KeyboardEvent) => {
				keyboardOffset.value = withTiming(-(e.endCoordinates.height - 16), {
					duration: e.duration || 250,
				});
				setTimeout(() => {
					scrollRef.current?.scrollToEnd({ animated: true });
				}, e.duration || 250);
			},
		);
		const hideSub = Keyboard.addListener(
			Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
			(e: KeyboardEvent) => {
				keyboardOffset.value = withTiming(0, {
					duration: e.duration || 250,
				});
			},
		);
		return () => {
			showSub.remove();
			hideSub.remove();
		};
	}, [keyboardOffset, scrollRef]);

	return inputAreaStyle;
};
