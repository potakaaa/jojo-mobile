import { describe, expect, it } from 'vitest';

import { LEGAL_LAST_UPDATED, LEGAL_SECTIONS } from '../terms-privacy-content';

describe('LEGAL_SECTIONS', () => {
  it('contains both a terms group and a privacy group in one shared array (AC4)', () => {
    const hasTerms = LEGAL_SECTIONS.some((section) => section.group === 'terms');
    const hasPrivacy = LEGAL_SECTIONS.some((section) => section.group === 'privacy');
    expect(hasTerms).toBe(true);
    expect(hasPrivacy).toBe(true);
  });

  it('has no placeholder wording in any heading or body (AC1 — mechanical)', () => {
    for (const section of LEGAL_SECTIONS) {
      expect(section.heading.toLowerCase()).not.toContain('placeholder');
      expect(section.body.toLowerCase()).not.toContain('placeholder');
    }
  });

  it('has a non-empty heading and body for every section (AC1 — structural)', () => {
    for (const section of LEGAL_SECTIONS) {
      expect(section.heading.trim().length).toBeGreaterThan(0);
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no self-referential meta-disclaimer wording in any body', () => {
    for (const section of LEGAL_SECTIONS) {
      expect(section.body.toLowerCase()).not.toContain('this copy is provided');
      expect(section.body.toLowerCase()).not.toContain('this notice is provided');
    }
  });

  it('includes the new Eligibility and Limitation of Liability terms sections', () => {
    const headings = LEGAL_SECTIONS.map((section) => section.heading);
    expect(headings).toContain('Eligibility');
    expect(headings).toContain('Limitation of Liability');
  });
});

describe('LEGAL_LAST_UPDATED', () => {
  it('is a non-empty date string', () => {
    expect(LEGAL_LAST_UPDATED.trim().length).toBeGreaterThan(0);
  });
});
