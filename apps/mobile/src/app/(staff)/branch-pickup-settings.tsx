/**
 * Branch Pickup Settings screen (staff) — STAFF-004.
 *
 * Allows staff to update the estimated prep time for their assigned branch.
 * Pickup acceptance toggling is admin-only.
 */

import { Button, Input, ScreenHeader, type ThemeMode } from '@jojopotato/ui';
import { useRouter } from 'expo-router';
import { useReducer, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useStaffBranchSettings } from '@/features/staff/hooks/use-staff-branch-settings';
import { usePatchBranchSettings } from '@/features/staff/hooks/use-patch-branch-settings';
import { initialPrepTimeState, prepTimeReducer } from '@/features/staff/lib/prep-time-reducer';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const PREP_TIME_MIN = 1;
const PREP_TIME_MAX = 120;

export default function BranchPickupSettingsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const router = useRouter();

  const { data: settings, isLoading, isError, isRefetching, refetch } = useStaffBranchSettings();
  const { mutate: patchSettings, isPending } = usePatchBranchSettings();

  const [prepState, dispatch] = useReducer(prepTimeReducer, initialPrepTimeState);
  const [prepTimeError, setPrepTimeError] = useState<string | null>(null);

  // Seed the prep-time field SYNCHRONOUSLY the moment settings are available,
  // guarded by the reducer's `hasSeeded` so it fires exactly once. Dispatching
  // during render (React's supported "storing info from previous renders"
  // pattern) re-renders with the seeded value BEFORE paint, so the field never
  // shows empty while `settings` is already defined/cached (AC6/AC7 — no
  // useEffect one-frame flash). Handles both the warm-cache revisit and the cold
  // first visit (settings undefined at mount, arriving later) in one construct.
  if (settings && !prepState.hasSeeded) {
    dispatch({ type: 'SETTINGS_ARRIVED', settings });
  }

  function handleSavePrepTime() {
    const parsed = parseInt(prepState.prepTimeText, 10);
    if (Number.isNaN(parsed) || parsed < PREP_TIME_MIN || parsed > PREP_TIME_MAX) {
      setPrepTimeError(`Enter a value between ${PREP_TIME_MIN} and ${PREP_TIME_MAX}`);
      return;
    }
    setPrepTimeError(null);
    // Re-seed deterministically from the server response on save (AC8) via the
    // call-site mutate options — react-query runs both the hook's own onSuccess
    // (query invalidate) and this callback, so no hook signature change needed.
    patchSettings(
      { estimatedPrepMinutes: parsed },
      { onSuccess: (updated) => dispatch({ type: 'SAVE_SUCCESS', settings: updated }) },
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="Branch Pickup Settings" onBack={() => router.back()} mode={mode} />

        <ScrollView
          testID="staff-branch-settings-scroll"
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
        >
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
                      value={prepState.prepTimeText}
                      onChangeText={(text) => {
                        dispatch({ type: 'USER_EDIT', text });
                        if (prepTimeError) setPrepTimeError(null);
                      }}
                      mode={mode}
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
