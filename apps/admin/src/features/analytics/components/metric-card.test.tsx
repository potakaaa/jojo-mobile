import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { MetricCard } from './metric-card';

afterEach(cleanup);

test('renders the label and value', () => {
  render(<MetricCard label="Total orders" value={42} />);
  expect(screen.getByText('Total orders')).toBeDefined();
  expect(screen.getByText('42')).toBeDefined();
});

test('renders the optional sub-label', () => {
  render(<MetricCard label="New vs returning customers" value="5 new" subLabel="1 returning" />);
  expect(screen.getByText('5 new')).toBeDefined();
  expect(screen.getByText('1 returning')).toBeDefined();
});
