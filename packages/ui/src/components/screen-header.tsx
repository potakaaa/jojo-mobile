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
 * Extracted from the six `(staff)` screens that each hand-rolled this same block
 * (active-orders, completed-orders, branch-pickup-settings, order-detail,
 * product-availability, pickup-lookup). Gap, paddings and type are preserved from
 * that original spec; the back glyph is `chevron-back` rather than the staff
 * screens' original `arrow-back` — a deliberate later design change applied here
 * once, so every consumer gets it.
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
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
      ) : null}
      {/*
        `header` role: the native navigation header this component replaces exposed
        its title as a heading to VoiceOver/TalkBack for free. Without this, every
        screen that adopts ScreenHeader loses heading-based navigation.
      */}
      <Text accessibilityRole="header" style={[styles.headerTitle, { color: theme.text }]}>
        {title}
      </Text>
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
