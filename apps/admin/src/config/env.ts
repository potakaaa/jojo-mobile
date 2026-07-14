/**
 * Typed access to the admin web app's Vite env vars. Distinct from the Expo
 * app's `EXPO_PUBLIC_*` convention — Vite exposes `import.meta.env.VITE_*` to
 * the client bundle. Falls back to the API's own default dev port when unset.
 */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
} as const;
