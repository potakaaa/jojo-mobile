import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { BrandWordmark } from '../brand-wordmark';
import { Brand, FontFamily } from '../../theme';

// AC1: display-bold headings resolve the new display family. BrandWordmark is a
// confirmed `FontFamily.display.bold` consumer (brand-wordmark.tsx:21), so its
// resolved fontFamily proves the token repoint reaches real call sites. This is
// non-vacuous: if the token reverts to the previous display face, the
// flattened fontFamily assertion fails.
test('BrandWordmark display-bold resolves to PlusJakartaSans_800ExtraBold', async () => {
  const { getByText } = await render(<BrandWordmark mode="light" />);
  const flat = StyleSheet.flatten(getByText(Brand.name).props.style);
  expect(flat.fontFamily).toBe('PlusJakartaSans_800ExtraBold');
  expect(FontFamily.display.bold).toBe('PlusJakartaSans_800ExtraBold');
});
