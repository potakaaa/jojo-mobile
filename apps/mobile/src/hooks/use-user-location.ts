// Native (iOS + Android) — metro resolves this over the .web.ts sibling on
// native targets.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** Hard cap on how long we wait for a GPS fix. Without it,
 * `getCurrentPositionAsync` can hang indefinitely (services on but no fix),
 * leaving `status` stuck on 'loading' forever. */
const LOCATION_TIMEOUT_MS = 10_000;

export type LocationStatus = 'loading' | 'granted' | 'denied';

export interface UserLocation {
  coords: { latitude: number; longitude: number } | null;
  status: LocationStatus;
}

export function useUserLocation(): UserLocation {
  const [state, setState] = useState<UserLocation>({ coords: null, status: 'loading' });

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        if (status !== 'granted') {
          setState({ coords: null, status: 'denied' });
          return;
        }
        // Race the position request against a timeout so a request that never
        // resolves rejects into the catch below instead of hanging on 'loading'.
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('location request timed out')),
              LOCATION_TIMEOUT_MS,
            );
          }),
        ]);
        if (!mounted) return;
        setState({
          coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
          status: 'granted',
        });
      } catch {
        // Location services off, no GPS fix, timeout, or a permission race —
        // degrade to the priority-sort path rather than crashing on an uncaught
        // rejection or leaving status stuck on 'loading'.
        if (mounted) setState({ coords: null, status: 'denied' });
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    })();
    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return state;
}
