import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { CustomerList } from './customer-list';
import type { AdminCustomerSummary } from '../lib/admin-customers-api';

afterEach(cleanup);

const customers: AdminCustomerSummary[] = [
  {
    id: 'c1',
    name: 'Maria Reyes',
    email: 'maria@example.com',
    phoneNumber: '+639170001111',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'c2',
    name: 'Jose Cruz',
    email: 'jose@example.com',
    phoneNumber: null,
    createdAt: '2026-05-01T00:00:00.000Z',
  },
];

function noop() {}

test('renders customer rows with name/email/phone columns', () => {
  render(
    <CustomerList
      customers={customers}
      isLoading={false}
      error={null}
      search=""
      onSearchChange={noop}
      onView={noop}
    />,
  );
  expect(screen.getByText('Maria Reyes')).toBeDefined();
  expect(screen.getByText('maria@example.com')).toBeDefined();
  expect(screen.getByText('+639170001111')).toBeDefined();
  // Null phone renders a placeholder, not blank.
  expect(screen.getByText('—')).toBeDefined();
});

test('fires onView when a row View button is clicked', () => {
  const onView = vi.fn();
  render(
    <CustomerList
      customers={customers}
      isLoading={false}
      error={null}
      search=""
      onSearchChange={noop}
      onView={onView}
    />,
  );
  const viewButtons = screen.getAllByRole('button', { name: 'View' });
  fireEvent.click(viewButtons[0]!);
  expect(onView).toHaveBeenCalledWith(customers[0]);
});

test('fires onSearchChange as the admin types', () => {
  const onSearchChange = vi.fn();
  render(
    <CustomerList
      customers={customers}
      isLoading={false}
      error={null}
      search=""
      onSearchChange={onSearchChange}
      onView={noop}
    />,
  );
  fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'maria' } });
  expect(onSearchChange).toHaveBeenCalledWith('maria');
});

test('renders the empty state', () => {
  render(
    <CustomerList
      customers={[]}
      isLoading={false}
      error={null}
      search="zzz"
      onSearchChange={noop}
      onView={noop}
    />,
  );
  expect(screen.getByText('No customers match this search.')).toBeDefined();
});
