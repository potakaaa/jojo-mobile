import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Card, ConfirmDialog, SettingsRow } from '@jojopotato/ui';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, Palette, Radii, Shadows, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { splitBirthday } from '@/features/auth/lib/birthday';
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from '@/features/theme/theme-preference';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Account tab root. Opens with a welcoming hero (avatar + time-based greeting +
 * name/email), a gentle profile-completion nudge when details are missing,
 * read-only profile fields, a grouped menu (Edit profile / Notifications /
 * Order History / Help), an appearance selector, Log out, and an app-version
 * footer. Logging out clears the better-auth session; the root gate returns to
 * Login.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const displayName = user?.name?.trim() ? user.name : 'Your account';
  const email = user?.email ?? '';
  const birthday = formatBirthday(user?.birthday);
  const address = user?.address?.trim() ? user.address : 'Not set yet';
  const hasBirthday = birthday !== NOT_SET;
  const hasAddress = address !== NOT_SET;
  const profileIncomplete = !hasBirthday || !hasAddress;
  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          Platform.OS !== 'web' && { paddingBottom: getFloatingTabBarClearance(insets.bottom) },
        ]}
      >
        {/* Hero */}
        <Card mode={mode} style={styles.hero}>
          <Avatar mode={mode} name={user?.name} size={68} />
          <View style={styles.heroText}>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting()} 👋</Text>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {email ? (
              <Text style={[styles.email, { color: theme.textSecondary }]} numberOfLines={1}>
                {email}
              </Text>
            ) : null}
          </View>
        </Card>

        {/* Profile-completion nudge */}
        {profileIncomplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish setting up your profile"
            onPress={() => router.push('/(tabs)/account/edit-profile')}
            style={({ pressed }) => [
              styles.nudge,
              { backgroundColor: theme.tint, borderColor: theme.border },
              pressed ? styles.nudgePressed : Shadows.offsetSm,
            ]}
          >
            <View style={styles.nudgeIcon}>
              <Ionicons name="sparkles" size={20} color={Palette.ink} />
            </View>
            <View style={styles.nudgeText}>
              <Text style={styles.nudgeTitle}>Finish setting up</Text>
              <Text style={styles.nudgeBody}>
                Add your {missingLabel(hasBirthday, hasAddress)} to personalize your experience.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Palette.ink} />
          </Pressable>
        ) : null}

        {/* Read-only profile fields */}
        <SectionLabel text="Profile" />
        <Card mode={mode} style={styles.listCard}>
          <SettingsRow mode={mode} icon="gift-outline" label="Birthday" value={birthday} />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow mode={mode} icon="location-outline" label="Address" value={address} />
        </Card>

        {/* Menu */}
        <SectionLabel text="Account" />
        <Card mode={mode} style={styles.listCard}>
          <SettingsRow
            mode={mode}
            icon="create-outline"
            label="Edit profile"
            onPress={() => router.push('/(tabs)/account/edit-profile')}
          />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow
            mode={mode}
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push('/(tabs)/notifications')}
          />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow
            mode={mode}
            icon="receipt-outline"
            label="Order History"
            onPress={() => router.push('/(tabs)/history')}
          />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow
            mode={mode}
            icon="help-circle-outline"
            label="Help"
            onPress={() => router.push('/(tabs)/account/help')}
          />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow
            mode={mode}
            icon="document-text-outline"
            label="Terms & Privacy"
            onPress={() => router.push('/(tabs)/terms')}
          />
        </Card>

        {/* Appearance */}
        <SectionLabel text="Appearance" />
        <Card mode={mode}>
          <ThemeToggle />
        </Card>

        <Button
          mode={mode}
          variant="outline"
          label="Log out"
          onPress={() => setConfirmSignOut(true)}
        />

        <Text style={[styles.version, { color: theme.textSecondary }]}>
          Jojo Potato · v{version}
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Log out?"
        message="You'll need to sign back in to place orders and see your rewards."
        confirmLabel="Yes, log out"
        cancelLabel="Stay signed in"
        variant="destructive"
        mode={mode}
        onConfirm={() => {
          setConfirmSignOut(false);
          signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </SafeAreaView>
  );
}

const NOT_SET = 'Not set yet';

/** Present a stored `YYYY-MM-DD` birthday as `MM/DD/YYYY`, or a friendly hint. */
function formatBirthday(value: string | null | undefined): string {
  const { mm, dd, yyyy } = splitBirthday(value);
  if (!mm || !dd || !yyyy) return NOT_SET;
  return `${mm}/${dd}/${yyyy}`;
}

/** Time-of-day greeting for the hero. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Human phrase for the fields still missing, used by the completion nudge. */
function missingLabel(hasBirthday: boolean, hasAddress: boolean): string {
  if (!hasBirthday && !hasAddress) return 'birthday and address';
  if (!hasBirthday) return 'birthday';
  return 'address';
}

function SectionLabel({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: theme.textSecondary }]} accessibilityRole="header">
      {text.toUpperCase()}
    </Text>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Appearance selector. `System` (default) follows the OS scheme; `Light`/`Dark`
 * override it. The choice persists across restarts (see theme-preference.ts).
 */
function ThemeToggle() {
  const theme = useTheme();
  const preference = useThemePreference();

  return (
    <View style={styles.themeSection}>
      <View style={[styles.segment, { borderColor: theme.border }]}>
        {THEME_OPTIONS.map((option) => {
          const active = preference === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setThemePreference(option.value)}
              style={[styles.segmentItem, active && { backgroundColor: theme.tint }]}
            >
              <Text
                style={[styles.segmentText, { color: active ? Palette.ink : theme.textSecondary }]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  heroText: { flex: 1, gap: Spacing.half },
  greeting: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
  name: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1 },
  email: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.bodySmall },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 2,
    borderRadius: Radii.md,
  },
  nudgePressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  nudgeIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    borderWidth: 2,
    borderColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeText: { flex: 1, gap: Spacing.half },
  nudgeTitle: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.body, color: Palette.ink },
  nudgeBody: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    color: Palette.ink,
  },
  sectionLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
    letterSpacing: 1,
    marginTop: Spacing.one,
    marginLeft: Spacing.one,
  },
  listCard: { paddingVertical: Spacing.one },
  themeSection: { gap: Spacing.one, alignItems: 'center' },
  segment: {
    flexDirection: 'row',
    borderWidth: 2,
    borderRadius: Radii.full,
    overflow: 'hidden',
  },
  segmentItem: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  segmentText: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.bodySmall },
  version: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
