// Native (iOS + Android) — metro resolves this over the .web.ts sibling on
// native targets.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type LocationStatus = 'loading' | 'granted' | 'denied';

export interface UserLocation {
  coords: { latitude: number; longitude: number } | null;
  status: LocationStatus;
}

export function useUserLocation(): UserLocation {
  const [state, setState] = useState<UserLocation>({ coords: null, status: 'loading' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mounted) return;
      if (status !== 'granted') {
        setState({ coords: null, status: 'denied' });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!mounted) return;
      setState({
        coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
        status: 'granted',
      });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
