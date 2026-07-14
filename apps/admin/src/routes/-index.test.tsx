import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdminHome } from '@/components/admin-home';

afterEach(cleanup);

test('renders the placeholder index route with the brand wordmark text', () => {
  render(<AdminHome />);
  expect(screen.getByText('Jojo Potato Admin')).toBeDefined();
});
