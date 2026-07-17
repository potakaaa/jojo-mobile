import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface ScreenHeaderProps {
  /** Title text rendered next to the back control. */
  title: string;
  /**
   * Back handler. When omitted, NO back control renders and the title sits at
   * the header's left inset — for screens that are the root of their stack and
   * have nowhere to go back to.
   */
  onBack?: () => void;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Compact in-content screen header: a back arrow and a title on one row.
 *
 * This is the app's canonical alternative to a tall native navigation header.
 * It exists because the NATIVE header owns the layout of its own `headerLeft`
 * slot — a screen sitting at index 0 of its stack gets no native back button,
 * and a custom control injected into that slot cannot be given the correct gap
 * or left inset from the outside. Rendering the header in content instead puts
 * that spacing under our control and keeps it identical across screens.
 *
 * Extracted verbatim from the six `(staff)` screens that each hand-rolled this
 * same block (active-orders, completed-orders, branch-pickup-settings,
 * order-detail, product-availability, pickup-lookup). The visual spec — gap,
 * paddings, glyph, size, type — is preserved exactly so those screens can adopt
 * it with zero pixel change.
 *
 * Supplies NO safe-area inset of its own: the host screen owns that, matching
 * the staff screens, which wrap it in `<SafeAreaView edges={['top', ...]}>`.
 */
export function ScreenHeader({ title, onBack, mode = 'light', style }: ScreenHeaderProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.header, style]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
      ) : null}
      <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  headerTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
  },
});
