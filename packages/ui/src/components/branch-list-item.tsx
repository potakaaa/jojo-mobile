import type { PickupBranch } from '@jojopotato/types';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  onPress?: () => void; // card-level tap (e.g. focus the map on this branch); the Order CTA still fires onOrderPress independently
  mode: ThemeMode;
}

/**
 * Full-width branch row for the branch locator list. Purely presentational —
 * the caller pre-computes `isOpen`, `showDistance`, `isEnabled`, and `isNearest`
 * (this component does NOT import getIsOpenNow or distanceKm). Renders name,
 * address, optional distance, open/closed badge, a pickup-availability badge
 * (shown ONLY when `isOpen` — a closed branch never shows a pickup badge), prep
 * time, and an "Order from this branch" CTA that is disabled when `!isEnabled`.
 * When `isNearest` is true, the card gets a jred accent outline and a
 * "Nearest to you" pill so it obviously reads as the user's closest branch.
 *
 * When `onPress` is provided, the card's informational region (badges, name,
 * address, meta — everything EXCEPT the Order CTA) becomes tappable so the row
 * itself can trigger an action (e.g. focus the map on this branch). The Order
 * CTA is kept OUTSIDE that pressable region as a sibling under `Card`, so its
 * tap fires `onOrderPress` only and can never double-fire the card `onPress`.
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
  onPress,
  mode,
}: BranchListItemProps) {
  const infoRegion = (
    <>
      {isNearest ? <Badge label="Nearest to you" variant="danger" mode={mode} /> : null}
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>
          {branch.name}
        </Text>
        <Badge
          label={isOpen ? 'Open' : 'Closed'}
          variant={isOpen ? 'success' : 'danger'}
          mode={mode}
        />
      </View>

      <Text style={styles.address} numberOfLines={2}>
        {branch.address}
      </Text>

      <View style={styles.metaRow}>
        {showDistance && typeof branch.distanceKm === 'number' ? (
          <Text style={styles.meta}>{branch.distanceKm.toFixed(1)} km</Text>
        ) : null}
        {isOpen ? (
          <Badge
            label={branch.isAcceptingPickup ? 'Pickup available' : 'Pickup unavailable'}
            variant={branch.isAcceptingPickup ? 'success' : 'danger'}
            mode={mode}
          />
        ) : null}
        <Text style={styles.meta}>~{branch.estimatedPrepMinutes} min</Text>
      </View>
    </>
  );

  return (
    <Card mode={mode} style={StyleSheet.flatten([styles.card, isNearest && styles.cardNearest])}>
      {onPress ? (
        <Pressable style={styles.infoRegion} onPress={onPress} accessibilityRole="button">
          {infoRegion}
        </Pressable>
      ) : (
        infoRegion
      )}

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
  // Wrapping the info block in a single Pressable collapses it to one Card
  // child, so re-apply the same inter-element gap here to keep layout identical.
  infoRegion: {
    gap: Spacing.two,
  },
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
