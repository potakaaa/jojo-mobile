// Web — metro resolves this over the non-suffixed file on web targets.
import { useEffect, useState } from 'react';

import type { UserLocation } from './use-user-location';

export type { LocationStatus, UserLocation } from './use-user-location';

export function useUserLocation(): UserLocation {
  const [state, setState] = useState<UserLocation>({ coords: null, status: 'loading' });

  useEffect(() => {
    let mounted = true;
    // Deferred so the first setState does not run synchronously in the effect
    // body (react-hooks/set-state-in-effect). Both branches resolve async.
    Promise.resolve().then(() => {
      if (!mounted) return;
      if (!navigator.geolocation) {
        setState({ coords: null, status: 'denied' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mounted) return;
          setState({
            coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
            status: 'granted',
          });
        },
        () => {
          if (!mounted) return;
          setState({ coords: null, status: 'denied' });
        },
      );
    });
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
