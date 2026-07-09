import { ScrollView, StyleSheet, Text } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Terms & Conditions. Pushed on top of the public stack with a native header
 * (default back button) — set in `(auth)/_layout.tsx`. Placeholder copy only.
 */
export default function TermsRoute() {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.heading, { color: theme.text }]}>Terms &amp; Conditions</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        Placeholder terms. Real legal copy will replace this once the product and
        provider decisions are finalized.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  heading: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h2 },
  body: { fontFamily: FontFamily.body.regular, fontSize: TypeScale.body, lineHeight: 24 },
});
