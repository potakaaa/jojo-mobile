import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Colors, Palette, Spacing, type ThemeMode } from '../theme';

export interface StarRatingInputProps {
  /** Current rating, 1..max. `0` means no rating chosen yet. */
  value: number;
  /** Called with the tapped star's index (1..max). */
  onChange: (rating: number) => void;
  /** Number of stars. Defaults to 5. */
  max?: number;
  /** Required theme mode (no default) — matches the repo theming convention. */
  mode: ThemeMode;
  /** Test handle; each star also gets `${testID}-star-${n}`. */
  testID?: string;
  style?: ViewStyle;
}

/**
 * Interactive tap-to-rate star input (order-completion-celebration). Controlled:
 * the parent owns `value`, and tapping star N calls `onChange(N)`. Pure
 * `View`/`Pressable` + Ionicons glyphs — no animation, no external library.
 *
 * Filled stars use the brand gold (`Palette.jgold`, the same accent
 * `StarProgressBar`'s fill uses); empty stars use the theme border token so the
 * outline reads correctly in both light and dark mode. `mode` is REQUIRED with no
 * default, matching every themed `packages/ui` component.
 */
export function StarRatingInput({
  value,
  onChange,
  max = 5,
  mode,
  testID,
  style,
}: StarRatingInputProps) {
  const theme = Colors[mode];
  const stars = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <View style={[styles.row, style]} testID={testID}>
      {stars.map((n) => {
        const filled = n <= value;
        return (
          <Pressable
            key={n}
            testID={testID ? `${testID}-star-${n}` : `star-rating-star-${n}`}
            accessibilityRole="button"
            accessibilityState={{ selected: filled }}
            accessibilityLabel={`Rate ${n} ${n === 1 ? 'star' : 'stars'}`}
            hitSlop={Spacing.two}
            onPress={() => onChange(n)}
            style={styles.star}
          >
            <Ionicons
              name={filled ? 'star' : 'star-outline'}
              size={36}
              color={filled ? Palette.jgold : theme.border}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  star: {
    padding: Spacing.half,
  },
});
