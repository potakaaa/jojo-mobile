/**
 * Branch Pickup Settings screen (staff) — STAFF-004.
 *
 * Allows staff to update the estimated prep time for their assigned branch.
 * Pickup acceptance toggling is admin-only.
 */

import { Button, Input, ScreenHeader, type ThemeMode } from '@jojopotato/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useStaffBranchSettings } from '@/features/staff/hooks/use-staff-branch-settings';
import { usePatchBranchSettings } from '@/features/staff/hooks/use-patch-branch-settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const PREP_TIME_MIN = 1;
const PREP_TIME_MAX = 120;

export default function BranchPickupSettingsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const router = useRouter();

  const { data: settings, isLoading, isError } = useStaffBranchSettings();
  const { mutate: patchSettings, isPending } = usePatchBranchSettings();

  const [prepTimeText, setPrepTimeText] = useState('');
  const [prepTimeError, setPrepTimeError] = useState<string | null>(null);
  const [seededSettings, setSeededSettings] = useState(settings);

  // Seed local state when settings first arrive (or change from a refetch).
  // Uses the "previous render" pattern — React-recommended alternative to useEffect + setState.
  if (settings !== seededSettings) {
    setSeededSettings(settings);
    if (settings) {
      setPrepTimeText(String(settings.estimatedPrepMinutes));
    }
  }

  function handleSavePrepTime() {
    const parsed = parseInt(prepTimeText, 10);
    if (Number.isNaN(parsed) || parsed < PREP_TIME_MIN || parsed > PREP_TIME_MAX) {
      setPrepTimeError(`Enter a value between ${PREP_TIME_MIN} and ${PREP_TIME_MAX}`);
      return;
    }
    setPrepTimeError(null);
    patchSettings({ estimatedPrepMinutes: parsed });
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="Branch Pickup Settings" onBack={() => router.back()} mode={mode} />

        <ScrollView contentContainerStyle={styles.content}>
          {isLoading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="large" color={theme.text} />
            </View>
          ) : isError ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Could not load branch settings
              </Text>
            </View>
          ) : settings ? (
            <>
              {/* Prep time */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>
                  Estimated Prep Time (minutes)
                </Text>
                <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>
                  Customers see this as the estimated wait time for their order
                </Text>
                <View style={styles.prepTimeRow}>
                  <View style={styles.prepTimeInput}>
                    <Input
                      value={prepTimeText}
                      onChangeText={(text) => {
                        setPrepTimeText(text);
                        if (prepTimeError) setPrepTimeError(null);
                      }}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      maxLength={3}
                      editable={!isPending}
                    />
                  </View>
                  <Button
                    label="Save"
                    variant="primary"
                    mode={mode}
                    onPress={handleSavePrepTime}
                    disabled={isPending}
                  />
                </View>
                {prepTimeError ? (
                  <Text style={[styles.errorText, { color: theme.accent }]}>{prepTimeError}</Text>
                ) : null}
                {isPending ? (
                  <Text style={[styles.savingText, { color: theme.textSecondary }]}>Saving…</Text>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  stateBlock: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  stateText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  sectionInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  sectionLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  sectionDescription: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  prepTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  prepTimeInput: {
    flex: 1,
  },
  errorText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  savingText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
});
