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
