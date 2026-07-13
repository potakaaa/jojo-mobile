import type { PickupBranch } from '@jojopotato/types';
import { Palette, type ThemeMode } from '@jojopotato/ui';
import { getIsOpenNow } from '@jojopotato/utils';
import { AppleMaps, GoogleMaps } from 'expo-maps';
import {
  AppleMapPointOfInterestCategory,
  AppleMapsMapStyleEmphasis,
} from 'expo-maps/build/apple/AppleMaps.types';
import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { MAP_STYLE_JSON } from '../map-style';

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
      <View style={styles.mapWrap}>
        <AppleMaps.View
          style={styles.map}
          cameraPosition={cameraPosition}
          // Force light appearance to approximate the warm brand look
          // (`colorScheme` is a top-level view prop, not part of `properties`).
          colorScheme={AppleMaps.MapColorScheme.LIGHT}
          properties={{
            // Muted emphasis deemphasizes map imagery for the low-clutter look.
            emphasis: AppleMapsMapStyleEmphasis.MUTED,
            // Hide high-clutter POI categories so branch pins stand out.
            pointsOfInterest: { excluding: EXCLUDED_POI_CATEGORIES },
          }}
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
        <WarmTintOverlay />
      </View>
    );
  }

  return (
    <View style={styles.mapWrap}>
      <GoogleMaps.View
        style={styles.map}
        cameraPosition={cameraPosition}
        properties={{ mapStyleOptions: { json: MAP_STYLE_JSON } }}
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
      <WarmTintOverlay />
    </View>
  );
}

/**
 * Low-opacity warm brand tint painted ABOVE the map. `pointerEvents="none"` is
 * mandatory — the overlay must never intercept map pan/zoom or marker taps.
 */
function WarmTintOverlay() {
  return <View pointerEvents="none" style={styles.warmOverlay} />;
}

/** High-clutter POI categories hidden on iOS to keep branch pins legible. */
const EXCLUDED_POI_CATEGORIES: AppleMapPointOfInterestCategory[] = [
  AppleMapPointOfInterestCategory.STORE,
  AppleMapPointOfInterestCategory.RESTAURANT,
  AppleMapPointOfInterestCategory.CAFE,
  AppleMapPointOfInterestCategory.GAS_STATION,
  AppleMapPointOfInterestCategory.PARKING,
  AppleMapPointOfInterestCategory.ATM,
  AppleMapPointOfInterestCategory.BANK,
  AppleMapPointOfInterestCategory.HOTEL,
  AppleMapPointOfInterestCategory.NIGHTLIFE,
];

const styles = StyleSheet.create({
  mapWrap: {
    flex: 1,
    width: '100%',
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  warmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,246,230,0.12)',
  },
});
