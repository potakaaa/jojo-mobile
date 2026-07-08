import type { PickupBranch } from '@jojopotato/types';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface BranchSelectorProps {
  branch: PickupBranch;
  onPress?: () => void;
}

/**
 * Tappable pickup-branch chip. Shows the branch name and open/closed state.
 * Tapping toggles a local selected highlight — it does not navigate. An
 * optional `onPress` is accepted for future wiring but the default behavior is
 * visual-only.
 */
export function BranchSelector({ branch, onPress }: BranchSelectorProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setSelected((s) => !s);
        onPress?.();
      }}
      style={[
        styles.container,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.textColumn}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Pickup from</Text>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {branch.name}
        </Text>
      </View>
      <Text style={[styles.status, { color: theme.accent }]}>
        {branch.isOpen ? 'Open' : 'Closed'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  textColumn: {
    flex: 1,
    gap: Spacing.half,
  },
  label: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  name: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  status: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
  },
});
