import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { FontFamily, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Rewards tab root. Placeholder with a dev link into the nested Coupons screen. */
export default function RewardsScreen() {
  const theme = useTheme();

  return (
    <ComingSoon title="Rewards">
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/rewards/coupons')}>
        <Text style={[styles.link, { color: theme.accent }]}>Dev: View Coupons</Text>
      </Pressable>
    </ComingSoon>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
