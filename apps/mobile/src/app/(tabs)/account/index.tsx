import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from '@/features/theme/theme-preference';
import { useTheme } from '@/hooks/use-theme';

/**
 * Account tab root. Links into the nested Notifications / Help screens, the
 * cross-tab Order History screen (which lives under the Order tab), and Log out.
 * Logging out clears the better-auth session; the root gate returns to Login.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();

  return (
    <ComingSoon title="Account">
      <ThemeToggle />
      <AccountLink
        label="Notifications"
        onPress={() => router.push('/(tabs)/account/notifications')}
        color={theme.accent}
      />
      <AccountLink
        label="Help"
        onPress={() => router.push('/(tabs)/account/help')}
        color={theme.accent}
      />
      <AccountLink
        label="Order History"
        onPress={() => router.push('/(tabs)/order/history')}
        color={theme.accent}
      />
      <AccountLink label="Log out" onPress={signOut} color={theme.accent} />
      {__DEV__ ? (
        <AccountLink
          label="Component Showcase (dev)"
          onPress={() => router.push('/component-showcase')}
          color={theme.accent}
        />
      ) : null}
    </ComingSoon>
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
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={[styles.link, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
