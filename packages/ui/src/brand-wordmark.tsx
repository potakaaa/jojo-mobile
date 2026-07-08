import { StyleSheet, Text, type TextStyle } from 'react-native';

import { Brand, Colors, FontFamily, type ThemeMode } from './theme';

export interface BrandWordmarkProps {
  mode?: ThemeMode;
  size?: number;
  style?: TextStyle;
}

export function BrandWordmark({ mode = 'light', size = 32, style }: BrandWordmarkProps) {
  return (
    <Text style={[styles.text, { color: Colors[mode].text, fontSize: size }, style]}>
      {Brand.name}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: FontFamily.display.bold,
  },
});
