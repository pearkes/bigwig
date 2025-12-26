import type React from "react";
import { useCallback } from "react";
import { Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	Extrapolation,
	interpolate,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DISMISS_THRESHOLD = SCREEN_WIDTH * 0.3;

interface SwipeableDismissProps {
	children: React.ReactNode;
	onDismiss: () => void;
	onBroadcast?: (message: string) => void;
	enabled?: boolean;
}

export const SwipeableDismiss = ({
	children,
	onDismiss,
	onBroadcast,
	enabled = true,
}: SwipeableDismissProps) => {
	const translateX = useSharedValue(0);
	const opacity = useSharedValue(1);

	const handleDismiss = useCallback(() => {
		onBroadcast?.("User dismissed item with swipe gesture");
		onDismiss();
	}, [onDismiss, onBroadcast]);

	const panGesture = Gesture.Pan()
		.enabled(enabled)
		.activeOffsetX([-15, 15])
		.failOffsetY([-10, 10])
		.onUpdate((event) => {
			translateX.value = event.translationX;
		})
		.onEnd((event) => {
			const shouldDismiss = Math.abs(event.translationX) > DISMISS_THRESHOLD;

			if (shouldDismiss) {
				const direction = event.translationX > 0 ? 1 : -1;
				translateX.value = withTiming(direction * SCREEN_WIDTH, {
					duration: 200,
				});
				opacity.value = withTiming(0, { duration: 200 }, (finished) => {
					if (finished) {
						runOnJS(handleDismiss)();
					}
				});
			} else {
				translateX.value = withTiming(0, { duration: 200 });
			}
		});

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
		opacity: interpolate(
			Math.abs(translateX.value),
			[0, DISMISS_THRESHOLD, SCREEN_WIDTH],
			[1, 0.7, 0],
			Extrapolation.CLAMP,
		),
	}));

	return (
		<GestureDetector gesture={panGesture}>
			<Animated.View style={animatedStyle}>{children}</Animated.View>
		</GestureDetector>
	);
};
