/**
 * Pure MM/DD/YYYY birthday helpers. Extracted so both the onboarding flow and
 * the account edit-profile screen share one validated implementation instead of
 * re-deriving the logic. `YYYY-MM-DD` is the canonical profile-contract string.
 */

/** The three raw numeric fields captured by the MM / DD / YYYY input row. */
export interface BirthdayParts {
  mm: string;
  dd: string;
  yyyy: string;
}

/**
 * Accepts a real `YYYY-MM-DD` calendar date. Rejects malformed shapes and
 * impossible dates — e.g. `2020-13-40` (bad month/day) and `2021-02-29`
 * (Feb 29 on a non-leap year). Same logic proven in the onboarding flow.
 */
export function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Assemble the three raw fields into a `YYYY-MM-DD` string, zero-padding single
 * digit month/day. Returns an empty string until all three fields are filled
 * (year must be four digits) so an incomplete date never yields a partial value.
 */
export function assembleBirthday({ mm, dd, yyyy }: BirthdayParts): string {
  if (yyyy.length !== 4 || mm.length === 0 || dd.length === 0) return '';
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Split a stored `YYYY-MM-DD` string back into the three raw fields for
 * pre-filling the edit form. Returns empty fields for null / blank / malformed
 * input. Inverse of `assembleBirthday` for any well-formed date.
 */
export function splitBirthday(value: string | null | undefined): BirthdayParts {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { mm: '', dd: '', yyyy: '' };
  }
  const parts = value.split('-');
  return { mm: parts[1] ?? '', dd: parts[2] ?? '', yyyy: parts[0] ?? '' };
}
