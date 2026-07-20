import { describe, expect, it } from 'vitest';

import { isDealScheduleLive, validateWindow } from '../deal-schedule';

/**
 * DEAL-005 Phase 1 — pure unit coverage for the ONE shared window check both
 * enforcement points call. The half-open boundary (AC7) is proven here at the exact
 * instant, which a DB-level integration test cannot do without racing the clock.
 */

const NOW = new Date('2026-07-20T12:00:00Z');
const t = (iso: string) => new Date(iso);

describe('isDealScheduleLive — no-backfill guarantee (AC3)', () => {
  it('treats ZERO schedule rows as always live', () => {
    expect(isDealScheduleLive([], NOW)).toBe(true);
  });

  it('is live with zero rows at any instant, past or future', () => {
    expect(isDealScheduleLive([], t('1999-01-01T00:00:00Z'))).toBe(true);
    expect(isDealScheduleLive([], t('2099-01-01T00:00:00Z'))).toBe(true);
  });
});

describe('isDealScheduleLive — single window', () => {
  it('is live inside the window', () => {
    expect(
      isDealScheduleLive(
        [{ starts_at: t('2026-07-20T00:00:00Z'), ends_at: t('2026-07-21T00:00:00Z') }],
        NOW,
      ),
    ).toBe(true);
  });

  it('is NOT live before a future starts_at (AC1)', () => {
    expect(
      isDealScheduleLive(
        [{ starts_at: t('2026-07-21T00:00:00Z'), ends_at: t('2026-07-22T00:00:00Z') }],
        NOW,
      ),
    ).toBe(false);
  });

  it('is NOT live after a past ends_at (AC2)', () => {
    expect(
      isDealScheduleLive(
        [{ starts_at: t('2026-07-18T00:00:00Z'), ends_at: t('2026-07-19T00:00:00Z') }],
        NOW,
      ),
    ).toBe(false);
  });
});

describe('isDealScheduleLive — half-open boundary (AC7)', () => {
  const startsAt = t('2026-07-20T12:00:00Z');
  const endsAt = t('2026-07-20T18:00:00Z');
  const window = [{ starts_at: startsAt, ends_at: endsAt }];

  it('starts_at is INCLUSIVE — live at the exact starting instant', () => {
    expect(isDealScheduleLive(window, new Date(startsAt.getTime()))).toBe(true);
  });

  it('is NOT live one millisecond before starts_at', () => {
    expect(isDealScheduleLive(window, new Date(startsAt.getTime() - 1))).toBe(false);
  });

  it('is live one second before ends_at', () => {
    expect(isDealScheduleLive(window, new Date(endsAt.getTime() - 1000))).toBe(true);
  });

  it('ends_at is EXCLUSIVE — NOT live at the exact ending instant', () => {
    expect(isDealScheduleLive(window, new Date(endsAt.getTime()))).toBe(false);
  });
});

describe('isDealScheduleLive — open-ended bounds', () => {
  it('null starts_at means already started', () => {
    expect(isDealScheduleLive([{ starts_at: null, ends_at: t('2026-07-21T00:00:00Z') }], NOW)).toBe(
      true,
    );
    expect(isDealScheduleLive([{ starts_at: null, ends_at: t('2026-07-19T00:00:00Z') }], NOW)).toBe(
      false,
    );
  });

  it('null ends_at means never ends on its own', () => {
    expect(isDealScheduleLive([{ starts_at: t('2026-07-19T00:00:00Z'), ends_at: null }], NOW)).toBe(
      true,
    );
    expect(isDealScheduleLive([{ starts_at: t('2026-07-21T00:00:00Z'), ends_at: null }], NOW)).toBe(
      false,
    );
  });

  it('both bounds null is live (total function; the API boundary rejects writing one)', () => {
    expect(isDealScheduleLive([{ starts_at: null, ends_at: null }], NOW)).toBe(true);
  });
});

describe('isDealScheduleLive — union of multiple windows (Phase 2 forward-compat)', () => {
  it('is live when ANY window contains now', () => {
    expect(
      isDealScheduleLive(
        [
          { starts_at: t('2026-07-01T00:00:00Z'), ends_at: t('2026-07-02T00:00:00Z') },
          { starts_at: t('2026-07-20T00:00:00Z'), ends_at: t('2026-07-21T00:00:00Z') },
        ],
        NOW,
      ),
    ).toBe(true);
  });

  it('is NOT live when EVERY window misses now', () => {
    expect(
      isDealScheduleLive(
        [
          { starts_at: t('2026-07-01T00:00:00Z'), ends_at: t('2026-07-02T00:00:00Z') },
          { starts_at: t('2026-07-25T00:00:00Z'), ends_at: t('2026-07-26T00:00:00Z') },
        ],
        NOW,
      ),
    ).toBe(false);
  });
});

describe('validateWindow (AC5)', () => {
  it('rejects startsAt === endsAt', () => {
    const same = t('2026-07-20T12:00:00Z');
    expect(validateWindow(same, same)).toBe('endsAt must be after startsAt');
  });

  it('rejects startsAt > endsAt', () => {
    expect(validateWindow(t('2026-07-21T00:00:00Z'), t('2026-07-20T00:00:00Z'))).toBe(
      'endsAt must be after startsAt',
    );
  });

  it('accepts startsAt < endsAt', () => {
    expect(validateWindow(t('2026-07-20T00:00:00Z'), t('2026-07-21T00:00:00Z'))).toBeNull();
  });

  it('accepts an open-ended window (either bound alone) and no bounds at all', () => {
    expect(validateWindow(t('2026-07-20T00:00:00Z'), null)).toBeNull();
    expect(validateWindow(null, t('2026-07-20T00:00:00Z'))).toBeNull();
    expect(validateWindow(undefined, undefined)).toBeNull();
  });
});
