import type { PickupBranch } from '@jojopotato/types';
import { forwardRef } from 'react';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Native BranchMap entry point + native-module guard.
 *
 * The real map (`branch-map-impl.tsx`) imports `expo-maps`, a NATIVE module that
 * is present only in a custom dev build — it does NOT exist in Expo Go, where
 * importing it throws at module-eval time (`Cannot find native module 'ExpoMaps'`)
 * and takes the whole Branches route down with it. So we load the impl through a
 * `require` wrapped in try/catch: in a dev build it resolves the real map; in
 * Expo Go (or any build lacking the native module) it falls back to a
 * non-crashing placeholder, keeping the rest of the Branches screen usable.
 *
 * (Web is served by `branch-map.web.ts`, which Metro resolves instead of this
 * file, so `expo-maps` never enters the web bundle.)
 */

export interface BranchMapProps {
  branches: PickupBranch[];
  coords: { latitude: number; longitude: number } | null;
  /**
   * Gates the native "my location" layer (the OS blue dot). True ONLY when the
   * runtime location permission is granted — enabling it without the grant
   * throws SecurityException on Android's setMyLocationEnabled.
   */
  isLocationEnabled: boolean;
  /**
   * Bottom inset (px) applied to the Android map's `contentPadding` so the native
   * Google controls/logo clear the floating tab bar. (Android-only in expo-maps v57.)
   */
  contentBottomInset: number;
  onBranchPress: (branchId: string) => void;
}

/**
 * Imperative handle exposed by the real map via ref. `focusOn` animates the map
 * camera. In the Expo Go fallback no ref attaches, so callers' `ref.current?.focusOn`
 * optional-chains to a harmless no-op.
 */
export interface BranchMapHandle {
  focusOn: (coords: { latitude: number; longitude: number }, zoom?: number) => void;
}

type BranchMapComponent = React.ForwardRefExoticComponent<
  BranchMapProps & React.RefAttributes<BranchMapHandle>
>;

// Resolve the real (expo-maps) implementation once at module load. The require
// throws in Expo Go (native module absent) — caught here so it degrades to the
// fallback instead of crashing the route.
let RealBranchMap: BranchMapComponent | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RealBranchMap = (require('./branch-map-impl') as { BranchMap: BranchMapComponent }).BranchMap;
} catch {
  RealBranchMap = null;
}

export const BranchMap = forwardRef<BranchMapHandle, BranchMapProps>(
  function BranchMap(props, ref) {
    if (RealBranchMap) {
      return <RealBranchMap {...props} ref={ref} />;
    }
    // Expo Go / no native map module — render a placeholder so the branch list +
    // bottom sheet above it stay fully functional.
    return <BranchMapUnavailable />;
  },
);

/** Neutral map-area placeholder shown when `expo-maps` isn't available. */
function BranchMapUnavailable() {
  const theme = useTheme();
  return (
    <View style={[styles.fallback, { backgroundColor: theme.backgroundElement }]}>
      <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
        Map preview needs a development build{'\n'}(not available in Expo Go).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  fallbackText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
});
