import { render } from '@testing-library/react-native';

import { Button } from '../button';

test('renders Button without throwing', () => {
  render(<Button label="Order now" onPress={() => {}} />);
});
