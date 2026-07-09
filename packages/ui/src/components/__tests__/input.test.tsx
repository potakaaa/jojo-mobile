import { render } from '@testing-library/react-native';

import { Input } from '../input';

test('renders Input without throwing', () => {
  render(<Input label="Name" placeholder="Your name" />);
});
