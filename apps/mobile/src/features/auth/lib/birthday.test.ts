import { describe, expect, it } from 'vitest';

import { assembleBirthday, isValidBirthday, splitBirthday } from './birthday';

describe('isValidBirthday', () => {
  it('accepts a real calendar date', () => {
    expect(isValidBirthday('1990-05-14')).toBe(true);
  });

  it('accepts Feb 29 on a leap year', () => {
    expect(isValidBirthday('2020-02-29')).toBe(true);
  });

  it('rejects Feb 29 on a non-leap year', () => {
    expect(isValidBirthday('2021-02-29')).toBe(false);
  });

  it('rejects an out-of-range month', () => {
    expect(isValidBirthday('1990-13-01')).toBe(false);
    expect(isValidBirthday('1990-00-10')).toBe(false);
  });

  it('rejects an out-of-range day', () => {
    expect(isValidBirthday('1990-04-31')).toBe(false); // April has 30 days
    expect(isValidBirthday('1990-05-00')).toBe(false);
    expect(isValidBirthday('1990-05-32')).toBe(false);
  });

  it('rejects the wrong shape', () => {
    expect(isValidBirthday('1990-5-14')).toBe(false);
    expect(isValidBirthday('05/14/1990')).toBe(false);
    expect(isValidBirthday('1990-05')).toBe(false);
    expect(isValidBirthday('')).toBe(false);
  });
});

describe('assembleBirthday', () => {
  it('assembles and zero-pads single-digit month/day', () => {
    expect(assembleBirthday({ mm: '5', dd: '4', yyyy: '1990' })).toBe('1990-05-04');
  });

  it('keeps two-digit month/day as-is', () => {
    expect(assembleBirthday({ mm: '12', dd: '25', yyyy: '2000' })).toBe('2000-12-25');
  });

  it('returns empty until every field is filled', () => {
    expect(assembleBirthday({ mm: '', dd: '4', yyyy: '1990' })).toBe('');
    expect(assembleBirthday({ mm: '5', dd: '', yyyy: '1990' })).toBe('');
    expect(assembleBirthday({ mm: '5', dd: '4', yyyy: '' })).toBe('');
    expect(assembleBirthday({ mm: '5', dd: '4', yyyy: '199' })).toBe('');
  });
});

describe('splitBirthday', () => {
  it('splits a stored YYYY-MM-DD string', () => {
    expect(splitBirthday('1990-05-14')).toEqual({ mm: '05', dd: '14', yyyy: '1990' });
  });

  it('returns empty fields for null / undefined / blank / malformed input', () => {
    expect(splitBirthday(null)).toEqual({ mm: '', dd: '', yyyy: '' });
    expect(splitBirthday(undefined)).toEqual({ mm: '', dd: '', yyyy: '' });
    expect(splitBirthday('')).toEqual({ mm: '', dd: '', yyyy: '' });
    expect(splitBirthday('1990-5-14')).toEqual({ mm: '', dd: '', yyyy: '' });
  });
});

describe('assemble / split round-trip', () => {
  it('round-trips a well-formed date', () => {
    const parts = splitBirthday('1990-05-14');
    expect(assembleBirthday(parts)).toBe('1990-05-14');
  });
});
