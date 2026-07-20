import { render } from '@testing-library/react-native';

import { FlavorSelector } from '../flavor-selector';
import { MOCK_FLAVOR } from './mocks';

test('renders FlavorSelector without throwing', () => {
  render(<FlavorSelector mode="light" flavors={[MOCK_FLAVOR]} selectedFlavorId={MOCK_FLAVOR.id} />);
});
