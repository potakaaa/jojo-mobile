import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { FontFamily, TypeScale } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/hooks/use-auth-session';
import { useTheme } from '@/hooks/use-theme';

/**
 * Account tab root. Links into the nested Notifications / Help screens, the
 * cross-tab Order History screen (which lives under the Order tab), and Log out.
 * Logging out clears the mocked session; the root gate returns to Login.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const { signOut } = useAuthSession();

  return (
    <ComingSoon title="Account">
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
});
