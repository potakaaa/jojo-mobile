import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/**
 * App theme preference.
 *
 * - `'system'` (the default, incl. first launch) follows the device's OS color
 *   scheme, so a fresh install matches the phone's light/dark setting.
 * - `'light'` / `'dark'` are explicit user overrides.
 *
 * The choice persists across restarts via `expo-secure-store`. This is a tiny
 * module-level store (NOT a React context) on purpose: `useColorScheme()` must
 * resolve it from anywhere — including the root layout, which renders above any
 * provider — so a context would create an ordering problem. See CLAUDE.md §Theming.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

let preference: ThemePreference = 'system';
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Load the persisted preference once at startup (call from the root layout).
 * Until this resolves, the in-memory default `'system'` is used — so the app
 * still follows the OS on the very first frames.
 */
export async function loadThemePreference(): Promise<void> {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored === 'system' || stored === 'light' || stored === 'dark') {
      preference = stored;
      emit();
    }
  } catch {
    // Non-fatal: fall back to the in-memory default ('system').
  }
}

/** Update the preference and persist it (persist is fire-and-forget). */
export function setThemePreference(next: ThemePreference): void {
  preference = next;
  emit();
  void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): ThemePreference {
  return preference;
}

/** Reactive read of the current theme preference. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
