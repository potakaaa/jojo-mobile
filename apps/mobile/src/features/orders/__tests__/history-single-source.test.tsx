import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from '@jest/globals';

/**
 * AC10 (static half) — Order History has exactly ONE fetch path.
 *
 * The rewritten `use-order-history.ts` must be the single react-query owner of
 * order-history data: it uses `useInfiniteQuery` and NO LONGER imports the bespoke
 * `use-async-data` hook (the old second, uncoordinated fetch mechanism). A static
 * source assertion — the runtime "only one consumer" half is the one-time EVL grep
 * documented in the plan.
 */
describe('use-order-history — single source (AC10)', () => {
  const source = readFileSync(join(__dirname, '..', 'hooks', 'use-order-history.ts'), 'utf8');

  test('the hook no longer imports use-async-data (the old second fetch path)', () => {
    expect(source).not.toMatch(/use-async-data/);
  });

  test('the hook is backed by react-query useInfiniteQuery', () => {
    expect(source).toMatch(/useInfiniteQuery/);
    expect(source).toMatch(/getNextPageParam/);
  });
});
