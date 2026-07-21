import { ScrollView, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { TermsPrivacyBody } from '@/features/legal/components/terms-privacy-body';
import { useTheme } from '@/hooks/use-theme';

/**
 * Terms & Conditions. Pushed on top of the public stack with a native header
 * (default back button, titled "Terms & Conditions" — set in `(auth)/_layout.tsx`).
 * Renders the shared `TermsPrivacyBody` filtered to the Terms document only; its
 * copy lives in `features/legal/terms-privacy-content.ts` (the single source
 * shared with the in-tabs `(tabs)/terms` screen).
 */
export default function TermsRoute() {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <TermsPrivacyBody theme={theme} group="terms" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
