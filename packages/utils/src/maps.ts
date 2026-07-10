/**
 * Build a platform-appropriate "open directions" URL for a branch location.
 *
 * Pure function — no React Native import. Negative lat/lng serialize correctly
 * in template literals; `name` is always percent-encoded.
 *
 * @param platform 'ios' → Apple Maps, 'android' → geo: intent, 'web' → Google Maps.
 */
export function buildDirectionsUrl(
  lat: number,
  lng: number,
  name: string,
  platform: 'ios' | 'android' | 'web',
): string {
  const encodedName = encodeURIComponent(name);
  switch (platform) {
    case 'ios':
      return `maps://?ll=${lat},${lng}&q=${encodedName}`;
    case 'android':
      return `geo:${lat},${lng}?q=${lat},${lng}(${encodedName})`;
    case 'web':
    default:
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
}
