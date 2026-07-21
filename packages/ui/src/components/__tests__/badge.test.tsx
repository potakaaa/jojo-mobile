import { render } from '@testing-library/react-native';

import { Badge } from '../badge';

test('renders Badge without throwing', () => {
  render(<Badge mode="light" label="Popular" />);
});
