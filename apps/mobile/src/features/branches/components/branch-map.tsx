import type { PickupBranch } from '@jojopotato/types';
import { Palette, type ThemeMode } from '@jojopotato/ui';
import { getIsOpenNow } from '@jojopotato/utils';
import { AppleMaps, GoogleMaps } from 'expo-maps';
import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';

/**
 * Native-only branch map. iOS renders Apple Maps, Android renders Google Maps
 * (both via expo-maps). Web is served by the `branch-map.web.ts` stub instead,
 * which Metro resolves automatically — this file never runs on web.
 *
 * expo-maps API notes (verified against installed v57.0.0):
 * - Markers are a declarative `markers` prop array, NOT JSX children. Each marker
 *   carries `id`, `coordinates`, `title`, and (Apple only) `tintColor`.
 * - Tapping a pin fires a single view-level `onMarkerClick(event)` where
 *   `event.id` identifies the marker — there is no per-marker `onPress`.
 * - Initial camera uses `cameraPosition: { coordinates, zoom }`, NOT a
 *   region-with-deltas object.
 */

/** Fallback camera centred on Cebu when the user's location is unavailable. */
const CEBU_FALLBACK = {
  latitude: 10.323,
  longitude: 123.9,
  // zoom ~13 shows a city-scale view (roughly the 0.05-degree delta the plan intended).
  zoom: 13,
};

const USER_LOCATION_ZOOM = 14;

export interface BranchMapProps {
  branches: PickupBranch[];
  coords: { latitude: number; longitude: number } | null;
  onBranchPress: (branchId: string) => void;
  mode?: ThemeMode;
}

export function BranchMap({ branches, coords, onBranchPress }: BranchMapProps) {
  const cameraPosition = useMemo(
    () => ({
      coordinates: {
        latitude: coords?.latitude ?? CEBU_FALLBACK.latitude,
        longitude: coords?.longitude ?? CEBU_FALLBACK.longitude,
      },
      zoom: coords ? USER_LOCATION_ZOOM : CEBU_FALLBACK.zoom,
    }),
    [coords],
  );

  // One marker per branch. `isActive` = open now AND accepting pickup.
  // Muted treatment: iOS dims the pin via tintColor; Android has no tint/opacity
  // prop on markers (known-gap — see phase report), so active pins are ordered on
  // top via zIndex and inactive pins carry a "(closed)" title suffix.
  const branchMarkers = useMemo(
    () =>
      branches.map((branch) => {
        const isOpen = getIsOpenNow(branch.openingHours);
        const isActive = isOpen && branch.isAcceptingPickup;
        return {
          id: branch.id,
          coordinates: { latitude: branch.latitude, longitude: branch.longitude },
          title: isActive ? branch.name : `${branch.name} (closed)`,
          isActive,
        };
      }),
    [branches],
  );

  if (Platform.OS === 'ios') {
    return (
      <AppleMaps.View
        style={styles.map}
        cameraPosition={cameraPosition}
        markers={branchMarkers.map((m) => ({
          id: m.id,
          coordinates: m.coordinates,
          title: m.title,
          tintColor: m.isActive ? Palette.jyellow : Palette.neutral400,
        }))}
        onMarkerClick={(event) => {
          if (event.id) onBranchPress(event.id);
        }}
      />
    );
  }

  return (
    <GoogleMaps.View
      style={styles.map}
      cameraPosition={cameraPosition}
      markers={branchMarkers.map((m) => ({
        id: m.id,
        coordinates: m.coordinates,
        title: m.title,
        zIndex: m.isActive ? 1 : 0,
      }))}
      onMarkerClick={(event) => {
        if (event.id) onBranchPress(event.id);
      }}
    />
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    width: '100%',
  },
});
