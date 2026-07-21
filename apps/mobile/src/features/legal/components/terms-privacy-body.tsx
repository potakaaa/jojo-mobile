import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LEGAL_LAST_UPDATED, LEGAL_SECTIONS } from '@/features/legal/terms-privacy-content';

/**
 * Presentational body for a single legal document — either the Terms & Conditions
 * or the Privacy Policy, selected by the required `group` prop. Renders only the
 * matching subset of the single shared `LEGAL_SECTIONS` module, so the copy lives
 * in exactly one place across every screen that shows it.
 *
 * No top-level document heading is rendered here — the calling screen's own
 * `<ScreenHeader title>` already names which document this is.
 *
 * Content-only: no `ScrollView`/`SafeAreaView` here — each route screen owns its
 * own scroll and safe-area wrapper. Colours come from the caller-supplied `theme`
 * (this screen has never used the `@jojopotato/ui` `mode`-prop component library).
 */
export function TermsPrivacyBody({
  theme,
  group,
}: {
  theme: ReturnType<typeof useTheme>;
  group: 'terms' | 'privacy';
}) {
  return (
    <View style={styles.container}>
      <Text style={[styles.lastUpdated, { color: theme.textSecondary }]}>
        Last updated: {LEGAL_LAST_UPDATED}
      </Text>
      {LEGAL_SECTIONS.filter((section) => section.group === group).map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={[styles.sectionHeading, { color: theme.text }]}>{section.heading}</Text>
          <Text style={[styles.sectionBody, { color: theme.textSecondary }]}>{section.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.four },
  lastUpdated: { fontFamily: FontFamily.body.regular, fontSize: TypeScale.caption },
  section: { gap: Spacing.one },
  sectionHeading: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.body },
  sectionBody: { fontFamily: FontFamily.body.regular, fontSize: TypeScale.body, lineHeight: 24 },
});
