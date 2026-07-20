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
    });
  });

  it('active deal with zero available branches → warning', () => {
    expect(dealStatus({ isActive: true, availableBranchCount: 0, activeBranchCount: 3 })).toEqual({
      label: 'Not available at any branch',
      tone: 'warning',
    });
  });

  it('active deal available at some branches → success with fraction', () => {
    expect(dealStatus({ isActive: true, availableBranchCount: 2, activeBranchCount: 3 })).toEqual({
      label: 'Active · 2/3 branches',
      tone: 'success',
    });
  });

  it('active deal with unknown availability → plain Active (no false warning)', () => {
    expect(dealStatus({ isActive: true })).toEqual({ label: 'Active', tone: 'success' });
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
    });
    // Absent keys behave identically to explicit nulls.
    expect(dealStatus(base, NOW)).toEqual({ label: 'Active · 2/3 branches', tone: 'success' });
  });

  it('future window → Scheduled', () => {
    expect(dealStatus({ ...base, startsAt: FUTURE_START, endsAt: FUTURE_END }, NOW)).toEqual({
      label: 'Scheduled',
      tone: 'neutral',
    });
  });

  it('current window → Live with the branch fraction', () => {
    expect(dealStatus({ ...base, startsAt: OPEN_START, endsAt: OPEN_END }, NOW)).toEqual({
      label: 'Live · 2/3 branches',
      tone: 'success',
    });
  });

  it('past window → Expired', () => {
    expect(dealStatus({ ...base, startsAt: PAST_START, endsAt: PAST_END }, NOW)).toEqual({
      label: 'Expired',
      tone: 'muted',
    });
  });

  it('inactive wins over any window state', () => {
    expect(
      dealStatus({ ...base, isActive: false, startsAt: OPEN_START, endsAt: OPEN_END }, NOW),
    ).toEqual({ label: 'Inactive', tone: 'muted' });
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
    ).toEqual({ label: 'Not available at any branch', tone: 'warning' });
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
    });
  });
});
