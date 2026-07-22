import {
  Button,
  Colors,
  Input,
  Radii,
  Shadows,
  StarRatingInput,
  type ThemeMode,
} from '@jojopotato/ui';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';

export interface OrderCelebrationOverlayProps {
  /** Controls mount/visibility. When false the overlay renders nothing. */
  visible: boolean;
  /** Required theme mode (no default) — matches the repo theming convention. */
  mode: ThemeMode;
  /** Submit the review. `comment` is omitted when blank. */
  onSubmit: (body: { rating: number; comment?: string }) => void;
  /** Skip / dismiss (scrim tap or Skip button). Never blocks navigation. */
  onDismiss: () => void;
  /** True while the submit mutation is in flight. */
  submitting?: boolean;
  /** True once a review was submitted — swaps the prompt for a thank-you. */
  submitted?: boolean;
  /** Inline error surfaced under the stars when a submit fails. */
  errorMessage?: string | null;
}

/**
 * The completion celebration + review prompt overlay (order-completion-celebration,
 * D4/D5/D7). Rendered in a Modal so its scrim covers the whole device screen
 * (same reasoning as `ConfirmDialog`). Reanimated-only visual (D7): a spring
 * "pop" on the celebration mark plus a `FadeInDown` entrance on the card — no
 * confetti/lottie dependency added.
 *
 * The review prompt embeds `StarRatingInput` + an optional comment `Input`.
 * Submit is disabled until a rating is chosen. Both Skip and the scrim call
 * `onDismiss`, which never blocks the customer from leaving (AC3). After a
 * successful submit the parent flips `submitted`, swapping the prompt for a
 * thank-you acknowledgement (D8: no edit path).
 */
export function OrderCelebrationOverlay({
  visible,
  mode,
  onSubmit,
  onDismiss,
  submitting = false,
  submitted = false,
  errorMessage,
}: OrderCelebrationOverlayProps) {
  const theme = Colors[mode];
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = visible ? withSpring(1, { damping: 9, stiffness: 140 }) : 0;
  }, [visible, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  if (!visible) return null;

  const canSubmit = rating > 0 && !submitting;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
        />
        <Animated.View
          entering={FadeInDown}
          testID="order-celebration-overlay"
          style={[
            styles.card,
            { backgroundColor: theme.background, borderColor: theme.border },
            Shadows.offsetMd,
          ]}
        >
          <Animated.Text style={[styles.emoji, popStyle]}>🎉</Animated.Text>
          <Text style={[styles.title, { color: theme.text }]}>You&apos;re all set!</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Enjoy your order — thanks for picking up with Jojo Potato.
          </Text>

          {submitted ? (
            <Text testID="celebration-thanks" style={[styles.thanks, { color: theme.text }]}>
              Thanks for your feedback! 🌟
            </Text>
          ) : (
            <View style={styles.prompt}>
              <Text style={[styles.promptTitle, { color: theme.text }]}>How was your pickup?</Text>
              <StarRatingInput
                value={rating}
                onChange={setRating}
                mode={mode}
                testID="celebration-stars"
                style={styles.stars}
              />
              <Input
                mode={mode}
                value={comment}
                onChangeText={setComment}
                placeholder="Add a comment (optional)"
                maxLength={1000}
                style={styles.comment}
              />
              {errorMessage ? (
                <Text style={[styles.error, { color: theme.accent }]}>{errorMessage}</Text>
              ) : null}
              <Button
                testID="celebration-submit"
                label="Submit review"
                variant="primary"
                mode={mode}
                disabled={!canSubmit}
                loading={submitting}
                onPress={() =>
                  onSubmit({
                    rating,
                    comment: comment.trim().length > 0 ? comment.trim() : undefined,
                  })
                }
              />
              <Button
                testID="celebration-skip"
                label="Skip"
                variant="outline"
                mode={mode}
                onPress={onDismiss}
              />
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: `#1C171459`, // ink at ~35% opacity, matching ConfirmDialog
    padding: Spacing.four,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radii.lg,
    borderWidth: 2,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 56,
    textAlign: 'center',
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
    lineHeight: TypeScale.bodySmall * 1.4,
  },
  prompt: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  promptTitle: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
    textAlign: 'center',
  },
  stars: {
    alignSelf: 'center',
  },
  comment: {
    alignSelf: 'stretch',
  },
  error: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
  thanks: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
