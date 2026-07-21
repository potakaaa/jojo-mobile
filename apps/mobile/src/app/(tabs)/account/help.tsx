import { Card, ScreenHeader, SettingsRow } from '@jojopotato/ui';
import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Help (nested Account screen, reached via `router.push('/(tabs)/account/help')`).
 * This stack runs `headerShown:false` (NAV-003), so the screen renders its own
 * `<ScreenHeader>` for the title + back affordance. It hosts the two legal
 * documents: Terms and Conditions and Privacy Policy, each a sibling push onto the
 * Tabs navigator (so `router.back()` from either returns here to Help).
 */
export default function HelpScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={['top', 'bottom']}
    >
      <ScreenHeader title="Help" onBack={() => router.back()} mode={mode} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card mode={mode} style={styles.listCard}>
          <SettingsRow
            mode={mode}
            icon="document-text-outline"
            label="Terms and Conditions"
            onPress={() => router.push('/(tabs)/terms')}
          />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow
            mode={mode}
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push('/(tabs)/privacy')}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  listCard: { paddingVertical: Spacing.one },
});
