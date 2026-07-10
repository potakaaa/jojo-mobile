import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useTheme } from '@/hooks/use-theme';

/**
 * Self-contained branch-switcher chip row for the Order tab. Reads/writes the
 * shared `useBranch()` state so switching here refreshes the menu (AC3). Kept
 * intentionally minimal (a chip row) — full Branches-tab UI is out of scope.
 */
export function BranchSwitcher() {
  const theme = useTheme();
  const { branches, selectedBranch, setSelectedBranch, isLoading } = useBranch();

  if (isLoading) {
    return <Text style={[styles.hint, { color: theme.textSecondary }]}>Loading branches…</Text>;
  }

  if (branches.length === 0) {
    return (
      <Text style={[styles.hint, { color: theme.textSecondary }]}>No branches available.</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Pickup from</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {branches.map((branch) => {
          const isSelected = branch.id === selectedBranch?.id;
          return (
            <Pressable
              key={branch.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelectedBranch(branch)}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? Palette.jyellow : theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text
                style={[styles.chipLabel, { color: isSelected ? Palette.ink : theme.text }]}
                numberOfLines={1}
              >
                {branch.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  label: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  chipLabel: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  hint: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
});
