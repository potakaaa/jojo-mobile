/* eslint-disable react-hooks/immutability --
 * React Compiler's render-purity rule mis-flags an idiomatic reanimated pattern
 * this component is built on: `translateX.value = …` (and the other shared-value
 * writes) mutate a reanimated shared value, which is mutable by design. The
 * compiler treats it as "a value passed to a hook (useAnimatedStyle)", but a
 * `Gesture.Pan` handler has no `useEffect` equivalent — the mutation MUST happen
 * in the callback. This is correct; there is no render-purity bug to hide.
 */
import { useCallback, type ReactNode } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Radii } from '../theme';

/** Rubber-band resistance applied to over-drag past the natural bounds. */
const OVERDRAG_RESISTANCE = 0.2;
/**
 * Fling velocity (dp/s) past which a fast leftward flick triggers the full-swipe
 * action regardless of distance. Deliberately high (vs the old 500 reveal
 * threshold) because a fling now directly fires the delete-confirm rather than
 * just revealing a button.
 */
const FLING_VELOCITY = 1200;
/** Fraction of the row's own width a drag must cross to count as a full swipe. */
const FULL_SWIPE_RATIO = 0.6;

export interface SwipeableRowProps {
  children: ReactNode;
  /**
   * Fired when the user swipes the row far enough (past {@link FULL_SWIPE_RATIO}
   * of its width) or flings it leftward fast enough. The row springs back to rest
   * immediately, so any confirm modal this opens appears over a settled row.
   */
  onFullSwipe: () => void;
  /** Accessible action name/label for the gesture-free fallback. Defaults to "Delete". */
  accessibilityActionLabel?: string;
}

/**
 * Reusable full-swipe-to-trigger row (notif-delete-pagination — the first
 * gesture-driven primitive in `@jojopotato/ui`). A horizontal `Gesture.Pan`
 * drags the row with NO visual chrome behind it; on release, if the row was
 * dragged past 60% of its own measured width (or flung leftward fast enough),
 * `onFullSwipe` fires and the row springs straight back to rest. Otherwise it
 * just springs back with no callback. Translation lives in a reanimated shared
 * value — not React state — so dragging never re-renders the row's list.
 *
 * There is no persistent "open" state and no revealed button: the swipe itself
 * IS the trigger. Accessibility: swiping is NOT the only path — the row exposes
 * a single `accessibilityAction` firing the exact same `onFullSwipe`, so an
 * assistive technology reaches it gesture-free. Reduced-motion users get a plain
 * `withTiming` snap instead of the spring bounce.
 */
export function SwipeableRow({
  children,
  onFullSwipe,
  accessibilityActionLabel = 'Delete',
}: SwipeableRowProps) {
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  // The row's own rendered width, captured via onLayout, so the full-swipe
  // threshold scales to the actual row size rather than a fixed pixel guess.
  const width = useSharedValue(0);

  const snapBack = useCallback(() => {
    if (reducedMotion) {
      translateX.value = withTiming(0, { duration: 160 });
    } else {
      translateX.value = withSpring(0, {
        damping: 18,
        stiffness: 220,
        overshootClamping: true,
      });
    }
  }, [reducedMotion, translateX]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
    },
    [width],
  );

  // Runs on the JS thread (`.runOnJS(true)` below), so it can call plain JS —
  // no `runOnJS` wrapping, no worklet directives. Correct (if marginally less
  // smooth) and renderable under the repo's jest reanimated mock.
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .runOnJS(true)
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      let next = startX.value + event.translationX;
      if (next > 0) {
        // Resist swiping the row rightward past its closed resting edge.
        next *= OVERDRAG_RESISTANCE;
      } else if (width.value > 0 && next < -width.value) {
        // Rubber-band resistance dragging left past the row's own width.
        const over = -width.value - next;
        next = -width.value - over * OVERDRAG_RESISTANCE;
      }
      translateX.value = next;
    })
    .onEnd((event) => {
      const pastThreshold = width.value > 0 && translateX.value <= -width.value * FULL_SWIPE_RATIO;
      const qualifyingFling = event.velocityX < -FLING_VELOCITY;
      if (pastThreshold || qualifyingFling) {
        onFullSwipe();
      }
      // Always settle back to rest — the row is never left dragged away.
      snapBack();
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === accessibilityActionLabel) {
      onFullSwipe();
    }
  };

  return (
    <View testID="swipeable-row" style={styles.container} onLayout={onLayout}>
      <GestureDetector gesture={pan}>
        <Animated.View
          testID="swipeable-row-content"
          style={rowStyle}
          // View defaults to accessible=false — without it, accessibilityActions/
          // onAccessibilityAction below are never exposed to VoiceOver/TalkBack,
          // silently breaking the gesture-free fallback path this component exists
          // to provide.
          accessible
          accessibilityActions={[
            { name: accessibilityActionLabel, label: accessibilityActionLabel },
          ]}
          onAccessibilityAction={onAccessibilityAction}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Clip the row to its bounds; radius matches the NotificationRow card so the
    // drag reads as part of the same surface.
    overflow: 'hidden',
    borderRadius: Radii.md,
  },
});
