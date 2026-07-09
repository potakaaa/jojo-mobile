import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { FontFamily, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Branch Locator (Branches tab root). Placeholder with a dev link into a Branch
 * Details screen so the nested stack can be walked manually.
 */
export default function BranchLocatorScreen() {
  const theme = useTheme();

  return (
    <ComingSoon title="Branches">
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/(tabs)/branches/[branchId]', params: { branchId: 'bgc-1' } })
        }
      >
        <Text style={[styles.link, { color: theme.accent }]}>Dev: View Branch bgc-1</Text>
      </Pressable>
    </ComingSoon>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
