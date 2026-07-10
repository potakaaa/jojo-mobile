import { Ionicons } from '@expo/vector-icons';
import type { PickupBranch } from '@jojopotato/types';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface BranchCardProps {
  branch: PickupBranch;
  isOpen: boolean; // was derived from branch.isOpen, now passed explicitly
  onPress?: () => void;
  mode?: ThemeMode;
}

/**
 * Tappable pickup-branch chip. Shows the branch name and open/closed state.
 * Tapping toggles a local selected highlight — it does not navigate. An
 * optional `onPress` is accepted for future wiring but the default behavior is
 * visual-only.
 */
export function BranchCard({ branch, isOpen, onPress, mode = 'light' }: BranchCardProps) {
  const theme = Colors[mode];
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
      <View style={[styles.pin, { backgroundColor: Palette.jyellow, borderColor: theme.border }]}>
        <Ionicons name="location" size={18} color={Palette.ink} />
      </View>
      <View style={styles.textColumn}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Pickup from</Text>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {branch.name}
        </Text>
      </View>
      <View style={[styles.statusPill, { borderColor: theme.accent }]}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isOpen ? Palette.green : theme.accent },
          ]}
        />
        <Text style={[styles.status, { color: theme.accent }]}>
          {isOpen ? 'Open' : 'Closed'}
        </Text>
      </View>
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
  pin: {
    width: 36,
    height: 36,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    borderWidth: 1.5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: Radii.full,
  },
  status: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
});
