import type { PickupBranch } from '@jojopotato/types';
import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Shadows, Spacing, TypeScale, type ThemeMode } from '../theme';
import { Badge } from './badge';
import { Button } from './button';
import { Card } from './card';

export interface BranchListItemProps {
  branch: PickupBranch;
  isOpen: boolean; // pre-computed by caller via getIsOpenNow
  showDistance: boolean; // true only when location status === 'granted'
  isEnabled: boolean; // isOpen && branch.isAcceptingPickup
  isNearest?: boolean; // this is the closest branch to the user (only when distance known)
  onOrderPress?: () => void;
  mode?: ThemeMode;
}

/**
 * Full-width branch row for the branch locator list. Purely presentational —
 * the caller pre-computes `isOpen`, `showDistance`, `isEnabled`, and `isNearest`
 * (this component does NOT import getIsOpenNow or distanceKm). Renders name,
 * address, optional distance, open/closed badge, pickup-availability badge, prep
 * time, and an "Order from this branch" CTA that is disabled when `!isEnabled`.
 * When `isNearest` is true, the card gets a jred accent outline and a
 * "Nearest to you" pill so it obviously reads as the user's closest branch.
 *
 * Composed from the shared primitives: `Card` (row surface), `Badge`
 * (open/closed + pickup-availability + nearest highlight), `Button` (order CTA).
 */
export function BranchListItem({
  branch,
  isOpen,
  showDistance,
  isEnabled,
  isNearest = false,
  onOrderPress,
  mode = 'light',
}: BranchListItemProps) {
  return (
    <Card mode={mode} style={StyleSheet.flatten([styles.card, isNearest && styles.cardNearest])}>
      {isNearest ? (
        <Badge label="Nearest to you" variant="danger" mode={mode} />
      ) : null}
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>
          {branch.name}
        </Text>
        <Badge label={isOpen ? 'Open' : 'Closed'} variant={isOpen ? 'success' : 'danger'} mode={mode} />
      </View>

      <Text style={styles.address} numberOfLines={2}>
        {branch.address}
      </Text>

      <View style={styles.metaRow}>
        {showDistance && typeof branch.distanceKm === 'number' ? (
          <Text style={styles.meta}>{branch.distanceKm.toFixed(1)} km</Text>
        ) : null}
        <Badge
          label={branch.isAcceptingPickup ? 'Pickup available' : 'Pickup unavailable'}
          variant={branch.isAcceptingPickup ? 'success' : 'danger'}
          mode={mode}
        />
        <Text style={styles.meta}>~{branch.estimatedPrepMinutes} min</Text>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  // PromoBanner treatment: yellow field, 2px ink outline, lg radius, and the
  // signature comic hard-shadow. Passed via Card's `style` override (applied
  // last), so these win over Card's default element bg / border / offsetSm.
  card: {
    gap: Spacing.two,
    backgroundColor: Palette.jyellow,
    borderColor: Palette.ink,
    borderRadius: Radii.lg,
    ...Shadows.offsetMd,
  },
  // Nearest branch: swap the ink outline for the jred accent and thicken it, plus
  // a deeper comic shadow, so the closest card visibly pops out of the list.
  cardNearest: {
    borderColor: Palette.jred,
    borderWidth: 3,
    ...Shadows.offsetLg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
    color: Palette.ink,
  },
  address: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
    color: Palette.ink,
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
    color: Palette.ink,
  },
});
