import { Button, Card, ConfirmDialog } from '@jojopotato/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
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
 * Account tab root. Shows the signed-in profile (name, read-only email,
 * birthday, address), an Edit-profile entry point, links into the nested
 * Notifications / Help screens and the cross-tab Order History screen, and
 * Log out. Logging out clears the better-auth session; the root gate returns to
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          Platform.OS !== 'web' && { paddingBottom: getFloatingTabBarClearance(insets.bottom) },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.name, { color: theme.text }]}>{displayName}</Text>
          {email ? (
            <Text style={[styles.email, { color: theme.textSecondary }]}>{email}</Text>
          ) : null}
        </View>

        <Card mode={mode}>
          <View style={styles.detailList}>
            <DetailRow
              label="Birthday"
              value={birthday}
              valueColor={theme.text}
              labelColor={theme.textSecondary}
            />
            <DetailRow
              label="Address"
              value={address}
              valueColor={theme.text}
              labelColor={theme.textSecondary}
            />
          </View>
        </Card>

        <Button
          mode={mode}
          label="Edit profile"
          onPress={() => router.push('/(tabs)/account/edit-profile')}
        />

        <Card mode={mode}>
          <View style={styles.linkList}>
            <AccountLink
              label="Notifications"
              onPress={() => router.push('/(tabs)/notifications')}
              color={theme.accent}
            />
            <AccountLink
              label="Help"
              onPress={() => router.push('/(tabs)/account/help')}
              color={theme.accent}
            />
            <AccountLink
              label="Order History"
              onPress={() => router.push('/(tabs)/history')}
              color={theme.accent}
            />
            <AccountLink
              label="Terms & Privacy"
              onPress={() => router.push('/(tabs)/terms')}
              color={theme.accent}
            />
          </View>
        </Card>

        <Card mode={mode}>
          <ThemeToggle />
        </Card>

        <Button
          mode={mode}
          variant="outline"
          label="Log out"
          onPress={() => setConfirmSignOut(true)}
        />
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

/** Present a stored `YYYY-MM-DD` birthday as `MM/DD/YYYY`, or a friendly hint. */
function formatBirthday(value: string | null | undefined): string {
  const { mm, dd, yyyy } = splitBirthday(value);
  if (!mm || !dd || !yyyy) return 'Not set yet';
  return `${mm}/${dd}/${yyyy}`;
}

function DetailRow({
  label,
  value,
  valueColor,
  labelColor,
}: {
  label: string;
  value: string;
  valueColor: string;
  labelColor: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: valueColor }]}>{value}</Text>
    </View>
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
      <Text style={[styles.themeLabel, { color: theme.textSecondary }]}>Appearance</Text>
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
                style={[styles.segmentText, { color: active ? theme.text : theme.textSecondary }]}
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

function AccountLink({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkRow}>
      <Text style={[styles.link, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.one },
  name: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1 },
  email: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.body },
  detailList: { gap: Spacing.three },
  detailRow: { gap: Spacing.half },
  detailLabel: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.caption },
  detailValue: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.body },
  linkList: { gap: Spacing.three },
  linkRow: { paddingVertical: Spacing.half },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
  themeSection: { gap: Spacing.one, alignItems: 'center' },
  themeLabel: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.caption },
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
});
