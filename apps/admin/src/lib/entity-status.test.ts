import { describe, expect, it } from 'vitest';

import { dealStatus, offerStatus, promotionStatus, windowPhase } from './entity-status';

const NOW = new Date('2026-07-16T12:00:00Z');
const PAST_START = '2026-07-01T00:00:00Z';
const PAST_END = '2026-07-10T00:00:00Z';
const FUTURE_START = '2026-08-01T00:00:00Z';
const FUTURE_END = '2026-08-10T00:00:00Z';
const OPEN_START = '2026-07-01T00:00:00Z';
const OPEN_END = '2026-07-31T00:00:00Z';

describe('windowPhase', () => {
  it('classifies before/within/after the window', () => {
    expect(windowPhase(FUTURE_START, FUTURE_END, NOW)).toBe('upcoming');
    expect(windowPhase(OPEN_START, OPEN_END, NOW)).toBe('active');
    expect(windowPhase(PAST_START, PAST_END, NOW)).toBe('expired');
  });
});

describe('dealStatus', () => {
  it('inactive deal → Inactive/muted regardless of availability', () => {
    expect(dealStatus({ isActive: false, availableBranchCount: 3, activeBranchCount: 3 })).toEqual({
      label: 'Inactive',
      tone: 'muted',
      recurring: false,
      recurringActive: null,
    });
  });

  it('active deal with zero available branches → warning', () => {
    expect(dealStatus({ isActive: true, availableBranchCount: 0, activeBranchCount: 3 })).toEqual({
      label: 'Not available at any branch',
      tone: 'warning',
      recurring: false,
      recurringActive: null,
    });
  });

  it('active deal available at some branches → success with fraction', () => {
    expect(dealStatus({ isActive: true, availableBranchCount: 2, activeBranchCount: 3 })).toEqual({
      label: 'Active · 2/3 branches',
      tone: 'success',
      recurring: false,
      recurringActive: null,
    });
  });

  it('active deal with unknown availability → plain Active (no false warning)', () => {
    expect(dealStatus({ isActive: true })).toEqual({
      label: 'Active',
      tone: 'success',
      recurring: false,
      recurringActive: null,
    });
  });
});

describe('offerStatus', () => {
  it('inactive offer → Inactive/muted regardless of window', () => {
    expect(offerStatus({ isActive: false, startAt: OPEN_START, endAt: OPEN_END }, NOW)).toEqual({
      label: 'Inactive',
      tone: 'muted',
    });
  });

  it('active offer, window states', () => {
    expect(offerStatus({ isActive: true, startAt: FUTURE_START, endAt: FUTURE_END }, NOW)).toEqual({
      label: 'Upcoming',
      tone: 'neutral',
    });
    expect(offerStatus({ isActive: true, startAt: OPEN_START, endAt: OPEN_END }, NOW)).toEqual({
      label: 'Active',
      tone: 'success',
    });
    expect(offerStatus({ isActive: true, startAt: PAST_START, endAt: PAST_END }, NOW)).toEqual({
      label: 'Expired',
      tone: 'muted',
    });
  });
});

describe('promotionStatus', () => {
  it('derives from the window only', () => {
    expect(promotionStatus({ startAt: FUTURE_START, endAt: FUTURE_END }, NOW)).toEqual({
      label: 'Upcoming',
      tone: 'neutral',
    });
    expect(promotionStatus({ startAt: OPEN_START, endAt: OPEN_END }, NOW)).toEqual({
      label: 'Active',
      tone: 'success',
    });
    expect(promotionStatus({ startAt: PAST_START, endAt: PAST_END }, NOW)).toEqual({
      label: 'Expired',
      tone: 'muted',
    });
  });
});

// ─── DEAL-005 — scheduled window layered onto the deal badge (AC9) ───────────
describe('dealStatus — DEAL-005 scheduled window', () => {
  const base = { isActive: true, availableBranchCount: 2, activeBranchCount: 3 };

  it('unscheduled deal (both bounds null) keeps the pre-DEAL-005 label', () => {
    expect(dealStatus({ ...base, startsAt: null, endsAt: null }, NOW)).toEqual({
      label: 'Active · 2/3 branches',
      tone: 'success',
      recurring: false,
      recurringActive: null,
    });
    // Absent keys behave identically to explicit nulls.
    expect(dealStatus(base, NOW)).toEqual({
      label: 'Active · 2/3 branches',
      tone: 'success',
      recurring: false,
      recurringActive: null,
    });
  });

  it('future window → Scheduled', () => {
    expect(dealStatus({ ...base, startsAt: FUTURE_START, endsAt: FUTURE_END }, NOW)).toEqual({
      label: 'Scheduled',
      tone: 'neutral',
      recurring: false,
      recurringActive: null,
    });
  });

  it('current window → Live with the branch fraction', () => {
    expect(dealStatus({ ...base, startsAt: OPEN_START, endsAt: OPEN_END }, NOW)).toEqual({
      label: 'Live · 2/3 branches',
      tone: 'success',
      recurring: false,
      recurringActive: null,
    });
  });

  it('past window → Expired', () => {
    expect(dealStatus({ ...base, startsAt: PAST_START, endsAt: PAST_END }, NOW)).toEqual({
      label: 'Expired',
      tone: 'muted',
      recurring: false,
      recurringActive: null,
    });
  });

  it('inactive wins over any window state', () => {
    expect(
      dealStatus({ ...base, isActive: false, startsAt: OPEN_START, endsAt: OPEN_END }, NOW),
    ).toEqual({ label: 'Inactive', tone: 'muted', recurring: false, recurringActive: null });
  });

  it('zero-branch warning wins over an otherwise-Live window', () => {
    expect(
      dealStatus(
        {
          isActive: true,
          availableBranchCount: 0,
          activeBranchCount: 3,
          startsAt: OPEN_START,
          endsAt: OPEN_END,
        },
        NOW,
      ),
    ).toEqual({
      label: 'Not available at any branch',
      tone: 'warning',
      recurring: false,
      recurringActive: null,
    });
  });

  it('handles open-ended windows on either side', () => {
    // Started, never ends → Live.
    expect(dealStatus({ ...base, startsAt: PAST_START, endsAt: null }, NOW).label).toBe(
      'Live · 2/3 branches',
    );
    // Starts later, never ends → Scheduled.
    expect(dealStatus({ ...base, startsAt: FUTURE_START, endsAt: null }, NOW).label).toBe(
      'Scheduled',
    );
    // No start, ends in the past → Expired.
    expect(dealStatus({ ...base, startsAt: null, endsAt: PAST_END }, NOW).label).toBe('Expired');
    // No start, ends in the future → Live.
    expect(dealStatus({ ...base, startsAt: null, endsAt: FUTURE_END }, NOW).label).toBe(
      'Live · 2/3 branches',
    );
  });

  it('falls back to a plain Live label when availability counts are unknown', () => {
    expect(dealStatus({ isActive: true, startsAt: OPEN_START, endsAt: OPEN_END }, NOW)).toEqual({
      label: 'Live',
      tone: 'success',
      recurring: false,
      recurringActive: null,
    });
  });
});

// ─── DEAL-005 Phase 2 — the additive `recurring` flag (AC10, derivation half) ──
//
// `recurring` is layered ALONGSIDE the label/tone, never folded into them: a deal
// inside its absolute window but outside today's recurring hours must still read
// "Live", because it returns in a few hours with no admin action. The UI half of
// AC10 (the badge actually rendering) is asserted in `deal-list.test.tsx`.
describe('dealStatus — DEAL-005 Phase 2 recurring flag', () => {
  const base = { isActive: true, availableBranchCount: 2, activeBranchCount: 3 };
  const RECUR = [1, 2, 3, 4, 5];

  it('is false when recurDays is absent, null, or empty', () => {
    expect(dealStatus(base, NOW).recurring).toBe(false);
    expect(dealStatus({ ...base, recurDays: null }, NOW).recurring).toBe(false);
    expect(dealStatus({ ...base, recurDays: [] }, NOW).recurring).toBe(false);
  });

  it('is true when recurDays is non-empty', () => {
    expect(dealStatus({ ...base, recurDays: RECUR }, NOW).recurring).toBe(true);
    // Sunday alone (day 0) must not be treated as falsy.
    expect(dealStatus({ ...base, recurDays: [0] }, NOW).recurring).toBe(true);
  });

  it('does NOT disturb the label/tone derivation in any branch', () => {
    // Layered against each existing branch: inactive, zero-branch, and each phase.
    expect(dealStatus({ ...base, isActive: false, recurDays: RECUR }, NOW)).toEqual({
      label: 'Inactive',
      tone: 'muted',
      recurring: true,
      recurringActive: null,
    });
    expect(dealStatus({ ...base, availableBranchCount: 0, recurDays: RECUR }, NOW)).toEqual({
      label: 'Not available at any branch',
      tone: 'warning',
      recurring: true,
      recurringActive: null,
    });
    expect(
      dealStatus({ ...base, startsAt: FUTURE_START, endsAt: FUTURE_END, recurDays: RECUR }, NOW),
    ).toEqual({ label: 'Scheduled', tone: 'neutral', recurring: true, recurringActive: null });
    expect(
      dealStatus({ ...base, startsAt: PAST_START, endsAt: PAST_END, recurDays: RECUR }, NOW),
    ).toEqual({ label: 'Expired', tone: 'muted', recurring: true, recurringActive: null });
  });

  it('still reads Live inside the absolute window, whatever the recurring hours are', () => {
    // The deliberate design call: the badge is NOT recurrence-accurate to the minute.
    expect(
      dealStatus({ ...base, startsAt: OPEN_START, endsAt: OPEN_END, recurDays: [0] }, NOW),
    ).toEqual({
      label: 'Live · 2/3 branches',
      tone: 'success',
      recurring: true,
      // recurDays present but NO time bounds → the recurrence is under-specified, so
      // "active now?" is unanswerable and stays null (no "Not active now" badge).
      recurringActive: null,
    });
  });
});

// ─── DEAL-005 Phase 2 — `recurringActive` (is the deal live in TODAY's Manila hours) ──
//
// Cosmetic only: the server's `isDealScheduleLive` is the visibility authority. This
// drives the admin-only "Active now" / "Not active now" badge. Manila = UTC+8, no DST.
// 2026-07-16 is a Thursday (day 4); 2026-07-18 is a Saturday (day 6).
describe('dealStatus — DEAL-005 Phase 2 recurringActive', () => {
  const base = {
    isActive: true,
    availableBranchCount: 2,
    activeBranchCount: 3,
    startsAt: OPEN_START,
    endsAt: OPEN_END,
  };
  // UTC 04:00 on Thu 2026-07-16 → Manila Thu 12:00.
  const THU_MANILA_NOON = new Date('2026-07-16T04:00:00Z');
  // UTC 12:00 on Thu 2026-07-16 → Manila Thu 20:00.
  const THU_MANILA_EVENING = new Date('2026-07-16T12:00:00Z');

  it('recurring deal inside today’s Manila window & day → true', () => {
    expect(
      dealStatus(
        { ...base, recurDays: [4], recurStartTime: '09:00', recurEndTime: '17:00' },
        THU_MANILA_NOON,
      ).recurringActive,
    ).toBe(true);
  });

  it('recurring deal past today’s Manila recurEndTime (still inside absolute window) → false', () => {
    const status = dealStatus(
      { ...base, recurDays: [4], recurStartTime: '09:00', recurEndTime: '17:00' },
      THU_MANILA_EVENING,
    );
    // Absolute window is still active — the deal reads Live, just not right now.
    expect(status.tone).toBe('success');
    expect(status.recurringActive).toBe(false);
  });

  it('recurring deal on a Manila day NOT in recurDays → false', () => {
    // Manila day is Thursday (4); recurDays only lists Monday.
    expect(
      dealStatus(
        { ...base, recurDays: [1], recurStartTime: '09:00', recurEndTime: '17:00' },
        THU_MANILA_NOON,
      ).recurringActive,
    ).toBe(false);
  });

  it('non-recurring deal (no recurDays) → null', () => {
    expect(dealStatus(base, THU_MANILA_NOON).recurringActive).toBeNull();
  });

  it('recurring deal whose absolute window is EXPIRED → null (gated on success tone)', () => {
    const status = dealStatus(
      {
        ...base,
        startsAt: PAST_START,
        endsAt: PAST_END,
        recurDays: [4],
        recurStartTime: '09:00',
        recurEndTime: '17:00',
      },
      THU_MANILA_NOON,
    );
    expect(status.tone).toBe('muted');
    expect(status.recurringActive).toBeNull();
  });

  it('uses the Manila day-of-week, not the host/UTC day (offset-boundary proof)', () => {
    // UTC Fri 2026-07-17 23:30 → Manila Sat 2026-07-18 07:30.
    const now = new Date('2026-07-17T23:30:00Z');
    // Recurs on Saturday (6, the Manila day) 07:00–09:00 → active.
    expect(
      dealStatus({ ...base, recurDays: [6], recurStartTime: '07:00', recurEndTime: '09:00' }, now)
        .recurringActive,
    ).toBe(true);
    // Recurs on Friday (5, the UTC day) only → NOT active, proving the day check
    // reads the Manila day, not the raw UTC day-of-week.
    expect(
      dealStatus({ ...base, recurDays: [5], recurStartTime: '07:00', recurEndTime: '09:00' }, now)
        .recurringActive,
    ).toBe(false);
  });
});
