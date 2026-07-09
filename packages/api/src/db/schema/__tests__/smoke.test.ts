import { describe, it, expect } from 'vitest';
import * as schema from '../index';

describe('schema exports', () => {
  const tables = [
    'users',
    'branches',
    'categories',
    'products',
    'productOptions',
    'branchProductAvailability',
    'deals',
    'dealProducts',
    'dealBranches',
    'coupons',
    'orders',
    'orderItems',
    'rewards',
    'userStars',
    'starTransactions',
    'notifications',
  ];

  tables.forEach((name) => {
    it(`exports ${name}`, () => {
      expect((schema as Record<string, unknown>)[name]).toBeDefined();
    });
  });
});
