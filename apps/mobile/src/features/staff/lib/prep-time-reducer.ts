import type { StaffBranchSettings } from '@jojopotato/types';

/**
 * Prep-time field seed state machine (STAFF-005). Fixes the "blank on cached
 * revisit" bug by keying the one-time seed off a `hasSeeded` boolean rather
 * than react-query object identity (the old `settings !== seededSettings`
 * check aliased the same cached object across mounts and never seeded).
 */
export interface PrepTimeState {
  prepTimeText: string;
  hasSeeded: boolean;
}

export type PrepTimeAction =
  /** Branch settings arrived from the query (first render or a background refetch). */
  | { type: 'SETTINGS_ARRIVED'; settings: StaffBranchSettings }
  /** A PATCH save succeeded — re-seed deterministically from the server response. */
  | { type: 'SAVE_SUCCESS'; settings: StaffBranchSettings }
  /** The user typed in the field. */
  | { type: 'USER_EDIT'; text: string };

export const initialPrepTimeState: PrepTimeState = { prepTimeText: '', hasSeeded: false };

export function prepTimeReducer(state: PrepTimeState, action: PrepTimeAction): PrepTimeState {
  switch (action.type) {
    case 'SETTINGS_ARRIVED':
      // Idempotent: seed exactly once. After the first seed this is a no-op, so
      // a background refetch (AC7) or a mid-edit refetch (AC9) never re-blanks
      // or stomps the field.
      if (state.hasSeeded) return state;
      return { prepTimeText: String(action.settings.estimatedPrepMinutes), hasSeeded: true };
    case 'SAVE_SUCCESS':
      // Always re-seed from the saved value (AC8) — deterministic regardless of
      // prior seed state.
      return { prepTimeText: String(action.settings.estimatedPrepMinutes), hasSeeded: true };
    case 'USER_EDIT':
      // Never flips hasSeeded — a user edit must not re-open the seed gate.
      return { ...state, prepTimeText: action.text };
    default:
      return state;
  }
}
