import { render } from '@testing-library/react-native';

import { BranchCard } from '../branch-card';
import { MOCK_BRANCH } from './mocks';

test('renders BranchCard without throwing', () => {
  render(<BranchCard mode="light" branch={MOCK_BRANCH} isOpen />);
});
