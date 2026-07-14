/**
 * Branch Pickup Settings screen (staff) — STAFF-004.
 *
 * Allows staff to toggle pickup order acceptance and update the estimated
 * prep time for their assigned branch.
 *
 * - Pickup toggle: immediate PATCH on switch change.
 * - Prep time: text input with a "Save" button; client-side validation (1–120 min).
 */

import { Ionicons } from '@expo/vector-icons';
import { Button, Input, type ThemeMode } from '@jojopotato/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';

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

  // Local state for the pickup toggle — updates instantly; reverts on error.
  const [pickupValue, setPickupValue] = useState<boolean | null>(null);
  // Local state for the prep time text input — seeded from server data once loaded.
  const [prepTimeText, setPrepTimeText] = useState('');
  const [prepTimeError, setPrepTimeError] = useState<string | null>(null);

  // Seed local state when settings first arrive (or change from a refetch).
  useEffect(() => {
    if (settings) {
      setPickupValue(settings.isAcceptingPickup);
      setPrepTimeText(String(settings.estimatedPrepMinutes));
    }
  }, [settings]);

  function handlePickupToggle(newValue: boolean) {
    setPickupValue(newValue);
    patchSettings(
      { isAcceptingPickup: newValue },
      { onError: () => setPickupValue(!newValue) },
    );
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
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Branch Pickup Settings</Text>
        </View>

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
              {/* Pickup toggle */}
              <View style={[styles.section, { borderBottomColor: theme.border }]}>
                <View style={styles.sectionRow}>
                  <View style={styles.sectionInfo}>
                    <Text style={[styles.sectionLabel, { color: theme.text }]}>
                      Accept Pickup Orders
                    </Text>
                    <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>
                      When off, customers cannot place new pickup orders for this branch
                    </Text>
                  </View>
                  <Switch
                    value={pickupValue ?? settings.isAcceptingPickup}
                    onValueChange={handlePickupToggle}
                    accessibilityLabel="Toggle pickup order acceptance"
                  />
                </View>
              </View>

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
                  <Text style={[styles.errorText, { color: theme.accent }]}>
                    {prepTimeError}
                  </Text>
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
