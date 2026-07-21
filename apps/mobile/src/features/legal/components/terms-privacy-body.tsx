import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LEGAL_LAST_UPDATED, LEGAL_SECTIONS } from '@/features/legal/terms-privacy-content';

/** Groups rendered in order, each with its own on-screen label. */
const GROUP_LABELS: { group: 'terms' | 'privacy'; label: string }[] = [
  { group: 'terms', label: 'Terms & Conditions' },
  { group: 'privacy', label: 'Privacy Policy' },
];

/**
 * Presentational body for the combined Terms & Privacy screen. Renders the two
 * labeled groups from the single shared `LEGAL_SECTIONS` module, so both route
 * files (`(auth)/terms.tsx` and `(tabs)/terms/index.tsx`) show identical copy.
 *
 * Content-only: no `ScrollView`/`SafeAreaView` here — each route screen owns its
 * own scroll and safe-area wrapper. Colours come from the caller-supplied `theme`
 * (this screen has never used the `@jojopotato/ui` `mode`-prop component library).
 */
export function TermsPrivacyBody({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.container}>
      <Text style={[styles.lastUpdated, { color: theme.textSecondary }]}>
        Last updated: {LEGAL_LAST_UPDATED}
      </Text>
      {GROUP_LABELS.map(({ group, label }) => (
        <View key={group} style={styles.group}>
          <Text style={[styles.groupLabel, { color: theme.text }]}>{label}</Text>
          {LEGAL_SECTIONS.filter((section) => section.group === group).map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={[styles.sectionHeading, { color: theme.text }]}>{section.heading}</Text>
              <Text style={[styles.sectionBody, { color: theme.textSecondary }]}>
                {section.body}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.five },
  lastUpdated: { fontFamily: FontFamily.body.regular, fontSize: TypeScale.caption },
  group: { gap: Spacing.three },
  groupLabel: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h2 },
  section: { gap: Spacing.one },
  sectionHeading: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.body },
  sectionBody: { fontFamily: FontFamily.body.regular, fontSize: TypeScale.body, lineHeight: 24 },
});
