import { expect, test } from 'vitest';

import { analyticsQueryKey } from './admin-analytics-api';

/**
 * E4 — the react-query key normalizes an unset `branchId` to the stable
 * placeholder `'all'` so "all branches" and a specific branch are distinct,
 * non-colliding cache entries.
 */

test('normalizes an unset branchId to the "all" placeholder', () => {
  expect(analyticsQueryKey({ from: '2099-06-10', to: '2099-06-20' })).toEqual([
    'admin',
    'analytics',
    '2099-06-10',
    '2099-06-20',
    'all',
  ]);
});

test('carries a specific branchId in the key', () => {
  expect(analyticsQueryKey({ from: '2099-06-10', to: '2099-06-20', branchId: 'b1' })).toEqual([
    'admin',
    'analytics',
    '2099-06-10',
    '2099-06-20',
    'b1',
  ]);
});

test('all-branches and specific-branch keys do not collide', () => {
  const all = analyticsQueryKey({ from: '2099-06-10', to: '2099-06-20' });
  const scoped = analyticsQueryKey({ from: '2099-06-10', to: '2099-06-20', branchId: 'b1' });
  expect(JSON.stringify(all)).not.toBe(JSON.stringify(scoped));
});
