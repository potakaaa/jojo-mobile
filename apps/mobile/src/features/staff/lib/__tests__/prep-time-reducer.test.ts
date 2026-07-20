import type { StaffBranchSettings } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { initialPrepTimeState, prepTimeReducer } from '../prep-time-reducer';

function settings(estimatedPrepMinutes: number): StaffBranchSettings {
  return { isAcceptingPickup: true, estimatedPrepMinutes };
}

describe('prepTimeReducer', () => {
  it('should seed prepTimeText on first SETTINGS_ARRIVED regardless of object identity', () => {
    // Bug repro: the old code seeded only when the settings object reference
    // CHANGED. On a cached revisit the reference was identical, so it never
    // seeded and the field stayed blank. The reducer keys off `hasSeeded`, so
    // it seeds on the first arrival no matter the object identity.
    const cached = settings(20);
    const seeded = prepTimeReducer(initialPrepTimeState, {
      type: 'SETTINGS_ARRIVED',
      settings: cached,
    });
    expect(seeded.prepTimeText).toBe('20');
    expect(seeded.hasSeeded).toBe(true);
  });

  it('should not re-blank on a background-refetch SETTINGS_ARRIVED after seed', () => {
    // After the first seed, a later SETTINGS_ARRIVED (e.g. a staleTime:0
    // background refetch resolving) is a no-op — the value never flickers.
    const seeded = prepTimeReducer(initialPrepTimeState, {
      type: 'SETTINGS_ARRIVED',
      settings: settings(20),
    });
    const afterRefetch = prepTimeReducer(seeded, {
      type: 'SETTINGS_ARRIVED',
      settings: settings(45),
    });
    expect(afterRefetch.prepTimeText).toBe('20');
    expect(afterRefetch.hasSeeded).toBe(true);
    // Idempotent: same state object returned (no re-render churn).
    expect(afterRefetch).toBe(seeded);
  });

  it('should always re-seed prepTimeText on SAVE_SUCCESS', () => {
    // A successful save deterministically re-seeds from the server response,
    // even after the user edited the field.
    const edited = prepTimeReducer(
      prepTimeReducer(initialPrepTimeState, { type: 'SETTINGS_ARRIVED', settings: settings(20) }),
      { type: 'USER_EDIT', text: '35' },
    );
    const afterSave = prepTimeReducer(edited, { type: 'SAVE_SUCCESS', settings: settings(35) });
    expect(afterSave.prepTimeText).toBe('35');
    expect(afterSave.hasSeeded).toBe(true);
  });

  it('should not stomp a mid-edit value when SETTINGS_ARRIVED fires after USER_EDIT', () => {
    // Mid-edit stomp FIXED (AC9): the user edits, then a background refetch
    // fires SETTINGS_ARRIVED — because hasSeeded is already true, the edit is
    // preserved. USER_EDIT itself never flips hasSeeded.
    const seeded = prepTimeReducer(initialPrepTimeState, {
      type: 'SETTINGS_ARRIVED',
      settings: settings(20),
    });
    const edited = prepTimeReducer(seeded, { type: 'USER_EDIT', text: '99' });
    expect(edited.hasSeeded).toBe(true); // USER_EDIT never flips hasSeeded

    const afterRefetch = prepTimeReducer(edited, {
      type: 'SETTINGS_ARRIVED',
      settings: settings(20),
    });
    expect(afterRefetch.prepTimeText).toBe('99'); // mid-edit value preserved
  });

  it('should have a blank, unseeded initial state', () => {
    expect(initialPrepTimeState).toEqual({ prepTimeText: '', hasSeeded: false });
  });
});
