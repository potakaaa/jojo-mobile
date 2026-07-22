import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { CustomerDetail } from './customer-detail';
import type { AdminCustomerDetail } from '../lib/admin-customers-api';

afterEach(cleanup);

const full: AdminCustomerDetail = {
  id: 'c1',
  name: 'Maria Reyes',
  email: 'maria@example.com',
  phoneNumber: '+639170001111',
  createdAt: '2026-06-01T00:00:00.000Z',
  birthday: '1990-05-15',
  address: '123 Mabini St',
  marketingOptIn: true,
  emailVerified: true,
  phoneNumberVerified: true,
  favoriteBranchName: 'Downtown Branch',
  onboardedAt: '2026-02-01T08:00:00.000Z',
  starsBalance: { current: 42, lifetime: 100 },
  recentOrders: [
    {
      id: 'o1',
      orderNumber: 'JP-0001',
      status: 'completed',
      placedAt: '2026-06-20T10:00:00.000Z',
      totalCents: 1000,
      itemSummary: '2× Loaded Fries',
      branchName: 'Downtown Branch',
    },
  ],
};

const sparse: AdminCustomerDetail = {
  id: 'c2',
  name: 'Jose Cruz',
  email: 'jose@example.com',
  phoneNumber: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  birthday: null,
  address: null,
  marketingOptIn: false,
  emailVerified: false,
  phoneNumberVerified: false,
  favoriteBranchName: null,
  onboardedAt: null,
  starsBalance: null,
  recentOrders: [],
};

test('renders all locked fields for a fully-populated customer', () => {
  render(<CustomerDetail customer={full} />);
  expect(screen.getAllByText('maria@example.com').length).toBeGreaterThan(0);
  expect(screen.getByText('+639170001111')).toBeDefined();
  expect(screen.getByText('123 Mabini St')).toBeDefined();
  // "Downtown Branch" appears twice: the Favorite-branch field + the order row.
  expect(screen.getAllByText('Downtown Branch').length).toBeGreaterThan(0);
  expect(screen.getByText('JP-0001')).toBeDefined();
  // Star balance renders the numeric values, not the empty-state copy.
  expect(screen.getByText('42')).toBeDefined();
  expect(screen.getByText('100')).toBeDefined();
});

test('renders placeholders (not blanks) for a sparsely-populated customer', () => {
  render(<CustomerDetail customer={sparse} />);
  // Null fields (phone, birthday, address, favorite branch, onboarded) → "Not set".
  expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(4);
  expect(screen.getByText('No star activity yet')).toBeDefined();
  expect(screen.getByText('No orders yet')).toBeDefined();
});

test('has zero editable form controls (read-only surface)', () => {
  render(<CustomerDetail customer={full} />);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
});
