/**
 * Placeholder Jojo Potato brand palette, shared across apps. Swap for the
 * real brand system once design assets are finalized.
 */
export const Brand = {
  name: 'Jojo Potato',
  tagline: 'Order ahead. Pick up fresh.',
  potatoBrown: '#5F3A22',
  fryGold: '#E8A33D',
  ketchupRed: '#D94F30',
  cream: '#FFF8EE',
} as const;

export const Colors = {
  light: {
    text: '#2B1B10',
    background: Brand.cream,
    backgroundElement: '#F4E9DA',
    backgroundSelected: '#EAD9BF',
    textSecondary: '#7A6650',
    tint: Brand.fryGold,
  },
  dark: {
    text: Brand.cream,
    background: '#1C130B',
    backgroundElement: '#2A1E13',
    backgroundSelected: '#3A2A1A',
    textSecondary: '#C7B39C',
    tint: Brand.fryGold,
  },
} as const;

export type ThemeMode = keyof typeof Colors;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;
