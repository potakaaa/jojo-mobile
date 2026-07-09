import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Card } from '../card';

test('renders Card without throwing', () => {
  render(
    <Card>
      <Text>Content</Text>
    </Card>,
  );
});
