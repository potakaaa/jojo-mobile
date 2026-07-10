import type { PickupBranch } from '@jojopotato/types';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';
import { Button } from './button';

export interface BranchListItemProps {
  branch: PickupBranch;
  isOpen: boolean; // pre-computed by caller via getIsOpenNow
  showDistance: boolean; // true only when location status === 'granted'
  isEnabled: boolean; // isOpen && branch.isAcceptingPickup
  onOrderPress?: () => void;
  mode?: ThemeMode;
}

/**
 * Full-width branch row for the branch locator list. Purely presentational —
 * the caller pre-computes `isOpen`, `showDistance`, and `isEnabled` (this
 * component does NOT import getIsOpenNow or distanceKm). Renders name, address,
 * optional distance, open/closed badge, pickup-availability text, prep time,
 * and an "Order from this branch" CTA that is disabled when `!isEnabled`.
 */
export function BranchListItem({
  branch,
  isOpen,
  showDistance,
  isEnabled,
  onOrderPress,
  mode = 'light',
}: BranchListItemProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {branch.name}
        </Text>
        <View style={[styles.statusPill, { borderColor: theme.accent }]}>
          <View
            style={[styles.statusDot, { backgroundColor: isOpen ? Palette.green : theme.accent }]}
          />
          <Text style={[styles.status, { color: theme.accent }]}>{isOpen ? 'Open' : 'Closed'}</Text>
        </View>
      </View>

      <Text style={[styles.address, { color: theme.textSecondary }]} numberOfLines={2}>
        {branch.address}
      </Text>

      <View style={styles.metaRow}>
        {showDistance && typeof branch.distanceKm === 'number' ? (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {branch.distanceKm.toFixed(1)} km
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {branch.isAcceptingPickup ? 'Pickup available' : 'Pickup unavailable'}
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          ~{branch.estimatedPrepMinutes} min
        </Text>
      </View>

      <Button
        label="Order from this branch"
        variant="accent"
        mode={mode}
        disabled={!isEnabled}
        onPress={() => {
          if (isEnabled) onOrderPress?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.h3,
  },
  address: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
  },
  meta: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
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
