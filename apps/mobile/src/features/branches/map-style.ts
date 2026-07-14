/**
 * Warm brand Google Maps style JSON (Android only — consumed by `branch-map.tsx`
 * via `properties.mapStyleOptions.json`). iOS uses a native colorScheme/emphasis
 * approximation instead (Google style JSON is Android/GoogleMaps-only).
 *
 * Authored in the Jojo Potato brand palette (see `packages/ui/src/theme.ts`),
 * following the style-array schema from https://mapstyle.withgoogle.com/.
 * Brand hexes used:
 *   - land / geometry:            cream `#FFF6E6`, landscape.man_made `#EFE7D2`
 *   - roads (soft-yellow tint):   arterial fill `#FFE9A8`, arterial stroke `#F7B500` (jgold),
 *                                 highway `#FFD21E` (jyellow)
 *   - labels:                     text fill muted brown `#5F3A22`, text stroke cream `#FFF6E6`
 *   - transit / admin accents:    brand brown `#C1440E` (jbrown)
 *   - water:                      toned warm blue-grey `#CFE0DA`
 *   - POI:                        de-emphasized (muted fills, business labels hidden) to cut clutter
 *
 * Exported as a single JSON string constant — do NOT inline this blob in the screen.
 */
const MAP_STYLE_ARRAY = [
  // Base geometry: warm cream land.
  { elementType: 'geometry', stylers: [{ color: '#FFF6E6' }] },
  // Global label text: muted brown fill on a cream stroke for legibility.
  { elementType: 'labels.text.fill', stylers: [{ color: '#5F3A22' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFF6E6' }] },
  { elementType: 'labels.icon', stylers: [{ saturation: -60 }, { lightness: 10 }] },

  // Administrative borders in a faint brand brown.
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#C1440E' }, { lightness: 40 }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },

  // Landscape: man-made surfaces slightly deeper cream.
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#EFE7D2' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#FFF1CC' }] },

  // POI: de-emphasized to reduce clutter; hide business labels entirely.
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#EFE7D2' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8A7A5A' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  // Parks: soft warm green-tinged, but toned down.
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E4E4C8' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6A7A4A' }] },

  // Roads: soft-yellow tint of the brand yellow.
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFE9A8' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#F0DCA8' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#5F3A22' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFE28A' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#F7B500' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFD21E' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#F7B500' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#FBEFD2' }] },

  // Transit lines in a faint brand brown.
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#E0D2B8' }] },
  {
    featureType: 'transit.line',
    elementType: 'geometry',
    stylers: [{ color: '#C1440E' }, { lightness: 55 }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5F3A22' }],
  },

  // Water: toned-down warm blue-grey, low saturation.
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#CFE0DA' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7A8C86' }] },
];

/** Warm brand map style, serialized for `GoogleMapsProperties.mapStyleOptions.json`. */
export const MAP_STYLE_JSON: string = JSON.stringify(MAP_STYLE_ARRAY);
