import { Platform } from 'react-native';

export { Brand, Colors, Spacing, type ThemeColor, type ThemeMode } from '@jojopotato/ui';

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const MaxContentWidth = 480;
