import type { PickupBranch } from '@jojopotato/types';
import { Palette } from '@jojopotato/ui';
import { getIsOpenNow } from '@jojopotato/utils';
import { useImage } from 'expo-image';
import { AppleMaps, GoogleMaps } from 'expo-maps';
import {
  AppleMapPointOfInterestCategory,
  AppleMapsMapStyleEmphasis,
} from 'expo-maps/build/apple/AppleMaps.types';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
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

/** Fallback camera centred on Cagayan de Oro (the seeded branch cluster) when
 * the user's location is unavailable, so the map opens near the branches. */
const CDO_FALLBACK = {
  latitude: 8.4772,
  longitude: 124.6459,
  // zoom ~13 shows a city-scale view (roughly the 0.05-degree delta the plan intended).
  zoom: 13,
};

const USER_LOCATION_ZOOM = 14;

/** Default zoom used by `focusOn` when the caller doesn't pass one — tight
 * enough to frame a single branch pin and its surroundings. */
const FOCUS_ZOOM = 16;

export interface BranchMapProps {
  branches: PickupBranch[];
  coords: { latitude: number; longitude: number } | null;
  onBranchPress: (branchId: string) => void;
}

/**
 * Imperative handle exposed by `BranchMap` via ref. `focusOn` animates the map
 * camera to the given coordinates (verified expo-maps API:
 * `GoogleMapsViewType.setCameraPosition` / `AppleMapsViewType.setCameraPosition`,
 * both taking `{ coordinates, zoom }`).
 */
export interface BranchMapHandle {
  focusOn: (coords: { latitude: number; longitude: number }, zoom?: number) => void;
}

export const BranchMap = forwardRef<BranchMapHandle, BranchMapProps>(function BranchMap(
  { branches, coords, onBranchPress },
  ref,
) {
  // Ref to the underlying native map view (Apple on iOS, Google on Android).
  // Both share the `setCameraPosition({ coordinates, zoom })` imperative method.
  const iosMapRef = useRef<AppleMaps.MapView>(null);
  const androidMapRef = useRef<GoogleMaps.MapView>(null);

  // Custom Jojo teardrop pin used as the branch marker icon. `useImage` must run
  // at the component top level (hooks rule) — NOT inside `branchMarkers.map`. It
  // returns `ImageRef | null` (null while the asset loads); each platform branch
  // falls back to the default marker/annotation while `pinIcon` is null. Loaded
  // via a relative `require` (repo convention — see src/constants/images.ts), not
  // the `@/assets` alias, which Metro does not resolve inside `require()`.
  const pinIcon = useImage(require('../../../../assets/images/jojo-pin.png'));

  useImperativeHandle(
    ref,
    () => ({
      focusOn: (target, zoom) => {
        const config = {
          coordinates: { latitude: target.latitude, longitude: target.longitude },
          zoom: zoom ?? FOCUS_ZOOM,
        };
        if (Platform.OS === 'ios') {
          iosMapRef.current?.setCameraPosition(config);
        } else {
          androidMapRef.current?.setCameraPosition(config);
        }
      },
    }),
    [],
  );

  const cameraPosition = useMemo(
    () => ({
      coordinates: {
        latitude: coords?.latitude ?? CDO_FALLBACK.latitude,
        longitude: coords?.longitude ?? CDO_FALLBACK.longitude,
      },
      zoom: coords ? USER_LOCATION_ZOOM : CDO_FALLBACK.zoom,
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
        const isOpen = branch.openingHours ? getIsOpenNow(branch.openingHours) : false;
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
          ref={iosMapRef}
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
            // Native "you are here" indicator — distinct from the branch pins.
            // Uses the OS location (already permission-gated by expo-location); if
            // permission is denied it simply doesn't show. Sets up a future
            // "nearest branch from you" feature.
            isMyLocationEnabled: true,
          }}
          // Custom images on Apple Maps require `annotations` (AppleMapsMarker has
          // no `icon` field — only AppleMapsAnnotation does). Verified expo-maps
          // v57 types: `annotations?: AppleMapsAnnotation[]` and a dedicated
          // `onAnnotationClick(event)` whose `event.id` mirrors `onMarkerClick`.
          // `tintColor` is inherited from AppleMapsMarker, so the closed/active
          // muting is preserved. While `pinIcon` is null (still loading), the
          // default annotation renders (icon omitted).
          annotations={branchMarkers.map((m) => ({
            id: m.id,
            coordinates: m.coordinates,
            title: m.title,
            tintColor: m.isActive ? Palette.jyellow : Palette.neutral400,
            ...(pinIcon ? { icon: pinIcon } : {}),
          }))}
          onAnnotationClick={(event) => {
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
        ref={androidMapRef}
        style={styles.map}
        cameraPosition={cameraPosition}
        properties={{
          mapStyleOptions: { json: MAP_STYLE_JSON },
          // Native "you are here" blue dot — clearly distinct from the branch
          // pins (works around Android's lack of a per-marker tint). Uses the OS
          // location (already permission-gated by expo-location); if permission is
          // denied it simply doesn't show. Sets up a future "nearest branch" feature.
          isMyLocationEnabled: true,
        }}
        markers={branchMarkers.map((m) => ({
          id: m.id,
          coordinates: m.coordinates,
          title: m.title,
          zIndex: m.isActive ? 1 : 0,
          // Custom Jojo pin. GoogleMapsMarker.icon defaults to a bottom-center
          // anchor, so the trimmed teardrop tip points at the coordinate. Omit
          // while `pinIcon` is null so the default marker shows meanwhile.
          ...(pinIcon ? { icon: pinIcon } : {}),
        }))}
        onMarkerClick={(event) => {
          if (event.id) onBranchPress(event.id);
        }}
      />
      <WarmTintOverlay />
    </View>
  );
});

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
