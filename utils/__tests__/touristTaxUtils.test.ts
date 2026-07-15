import { describe, it, expect } from 'vitest';
import {
  parseTouristTaxPeriods,
  serializeTouristTaxPeriods,
  getActivePeriodForDate,
  getPeriodsForFiscalYear,
  createDefaultPeriodForYear,
  hasOverlap,
  sortPeriodsByDate,
  getSemesterDateBounds,
  isDateInSemester,
} from '../touristTaxUtils';
import type { FiscalYear, TouristTaxConfig, TouristTaxPeriod } from '../../types';

// ============================================================================
// FACTORIES
// ============================================================================

const makePeriod = (overrides: Partial<TouristTaxPeriod> = {}): TouristTaxPeriod => ({
  id: 'p-001',
  startDate: '2025-01-01',
  endDate: undefined,
  rate: 1,
  maxNights: 7,
  minAge: 17,
  enabled: true,
  ...overrides,
});

const makeFiscalYear = (overrides: Partial<FiscalYear> = {}): FiscalYear => ({
  id: 'fy-2025',
  year: 2025,
  status: 'OPEN',
  openedAt: '2025-01-01T00:00:00Z',
  notes: '',
  ...overrides,
});

const makeTaxConfig = (overrides: Partial<TouristTaxConfig> = {}): TouristTaxConfig => ({
  rate: 2,
  maxNights: 10,
  minAge: 16,
  enabled: true,
  ...overrides,
});

// ============================================================================
// parseTouristTaxPeriods
// ============================================================================

describe('parseTouristTaxPeriods', () => {
  it('returns empty array for undefined', () => {
    expect(parseTouristTaxPeriods(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseTouristTaxPeriods('')).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseTouristTaxPeriods('not-json')).toEqual([]);
  });

  it('returns empty array when JSON is not an array', () => {
    expect(parseTouristTaxPeriods('{"id":"x"}')).toEqual([]);
  });

  it('parses a valid JSON array of periods', () => {
    const period = makePeriod();
    const json = JSON.stringify([period]);
    const result = parseTouristTaxPeriods(json);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p-001');
    expect(result[0].rate).toBe(1);
  });

  it('parses multiple periods', () => {
    const p1 = makePeriod({ id: 'p-1', startDate: '2025-01-01', endDate: '2025-06-30' });
    const p2 = makePeriod({ id: 'p-2', startDate: '2025-07-01' });
    const json = JSON.stringify([p1, p2]);
    expect(parseTouristTaxPeriods(json)).toHaveLength(2);
  });
});

// ============================================================================
// serializeTouristTaxPeriods
// ============================================================================

describe('serializeTouristTaxPeriods', () => {
  it('serializes empty array to JSON', () => {
    expect(serializeTouristTaxPeriods([])).toBe('[]');
  });

  it('round-trips through parse and serialize', () => {
    const periods = [
      makePeriod({ id: 'a', startDate: '2025-01-01', endDate: '2025-06-30' }),
      makePeriod({ id: 'b', startDate: '2025-07-01' }),
    ];
    const json = serializeTouristTaxPeriods(periods);
    const back = parseTouristTaxPeriods(json);
    expect(back).toHaveLength(2);
    expect(back[0].id).toBe('a');
    expect(back[1].id).toBe('b');
  });
});

// ============================================================================
// getActivePeriodForDate
// ============================================================================

describe('getActivePeriodForDate', () => {
  it('returns null for empty periods', () => {
    expect(getActivePeriodForDate([], '2025-06-15')).toBeNull();
  });

  it('returns the single open-ended period when date is after startDate', () => {
    const p = makePeriod({ startDate: '2025-01-01', endDate: undefined });
    expect(getActivePeriodForDate([p], '2025-09-01')).toEqual(p);
  });

  it('returns null when date is before all periods', () => {
    const p = makePeriod({ startDate: '2025-06-01', endDate: undefined });
    expect(getActivePeriodForDate([p], '2025-05-31')).toBeNull();
  });

  it('returns null when date is after closed period endDate', () => {
    const p = makePeriod({ startDate: '2025-01-01', endDate: '2025-03-31' });
    expect(getActivePeriodForDate([p], '2025-04-01')).toBeNull();
  });

  it('returns period exactly on startDate', () => {
    const p = makePeriod({ startDate: '2025-07-01', endDate: undefined });
    expect(getActivePeriodForDate([p], '2025-07-01')).toEqual(p);
  });

  it('returns period exactly on endDate', () => {
    const p = makePeriod({ startDate: '2025-01-01', endDate: '2025-06-30' });
    expect(getActivePeriodForDate([p], '2025-06-30')).toEqual(p);
  });

  it('selects the latest startDate when multiple periods match a date', () => {
    // Should not happen with valid data, but the function must be deterministic
    const p1 = makePeriod({ id: 'early', startDate: '2025-01-01', endDate: undefined, rate: 1 });
    const p2 = makePeriod({ id: 'later', startDate: '2025-07-01', endDate: undefined, rate: 2 });
    const result = getActivePeriodForDate([p1, p2], '2025-09-01');
    expect(result?.id).toBe('later');
  });

  it('picks the correct period in a two-period split year', () => {
    const first = makePeriod({ id: 'h1', startDate: '2025-01-01', endDate: '2025-06-30', rate: 1 });
    const second = makePeriod({ id: 'h2', startDate: '2025-07-01', endDate: undefined, rate: 2 });
    expect(getActivePeriodForDate([first, second], '2025-03-15')?.id).toBe('h1');
    expect(getActivePeriodForDate([first, second], '2025-07-01')?.id).toBe('h2');
    expect(getActivePeriodForDate([first, second], '2025-12-31')?.id).toBe('h2');
  });
});

// ============================================================================
// getPeriodsForFiscalYear
// ============================================================================

describe('getPeriodsForFiscalYear', () => {
  it('returns parsed periods when fiscal year has touristTaxPeriods', () => {
    const p = makePeriod({ id: 'custom' });
    const fy = makeFiscalYear({ touristTaxPeriods: JSON.stringify([p]) });
    const result = getPeriodsForFiscalYear(fy);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('custom');
  });

  it('returns fallback synthetic period when fiscal year has no periods and no fallback config', () => {
    const fy = makeFiscalYear({ touristTaxPeriods: undefined });
    const result = getPeriodsForFiscalYear(fy);
    expect(result).toHaveLength(1);
    expect(result[0].startDate).toBe('2025-01-01');
  });

  it('uses provided fallback config for synthetic period', () => {
    const fy = makeFiscalYear({ touristTaxPeriods: undefined });
    const fallback = makeTaxConfig({ rate: 3.5 });
    const result = getPeriodsForFiscalYear(fy, fallback);
    expect(result[0].rate).toBe(3.5);
  });

  it('always returns at least one period', () => {
    const fy = makeFiscalYear({ touristTaxPeriods: '[]' }); // empty array
    const result = getPeriodsForFiscalYear(fy);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// createDefaultPeriodForYear
// ============================================================================

describe('createDefaultPeriodForYear', () => {
  it('sets startDate to Jan 1 of the given year', () => {
    const p = createDefaultPeriodForYear(2026, makeTaxConfig());
    expect(p.startDate).toBe('2026-01-01');
  });

  it('copies rate, maxNights, minAge and enabled from config', () => {
    const config = makeTaxConfig({ rate: 1.5, maxNights: 5, minAge: 14, enabled: false });
    const p = createDefaultPeriodForYear(2025, config);
    expect(p.rate).toBe(1.5);
    expect(p.maxNights).toBe(5);
    expect(p.minAge).toBe(14);
    expect(p.enabled).toBe(false);
  });

  it('leaves endDate undefined', () => {
    const p = createDefaultPeriodForYear(2025, makeTaxConfig());
    expect(p.endDate).toBeUndefined();
  });

  it('generates a unique id', () => {
    const p1 = createDefaultPeriodForYear(2025, makeTaxConfig());
    const p2 = createDefaultPeriodForYear(2025, makeTaxConfig());
    expect(p1.id).not.toBe(p2.id);
  });
});

// ============================================================================
// hasOverlap
// ============================================================================

describe('hasOverlap', () => {
  const existing: TouristTaxPeriod[] = [
    makePeriod({ id: 'e1', startDate: '2025-01-01', endDate: '2025-06-30' }),
    makePeriod({ id: 'e2', startDate: '2025-07-01', endDate: undefined }),
  ];

  it('returns false when new period is after all existing (no conflict)', () => {
    // Should not conflict because existing e2 covers 07-01 onwards; a new period
    // starting 2026-01-01 is outside the year, but hasOverlap only checks date ranges.
    // Let's use a non-overlapping year entirely:
    const newP = { startDate: '2024-01-01', endDate: '2024-12-31' };
    expect(hasOverlap(newP, existing)).toBe(false);
  });

  it('detects overlap with an existing closed period', () => {
    const newP = { startDate: '2025-03-01', endDate: '2025-05-31' };
    expect(hasOverlap(newP, existing)).toBe(true);
  });

  it('detects overlap with an open-ended period', () => {
    const newP = { startDate: '2025-08-01', endDate: undefined };
    expect(hasOverlap(newP, existing)).toBe(true);
  });

  it('excludes the period being edited (excludeId)', () => {
    // Editing e1 and keeping the same dates should not flag itself as overlap
    const editedP = { startDate: '2025-01-01', endDate: '2025-06-30' };
    expect(hasOverlap(editedP, existing, 'e1')).toBe(false);
  });

  it('returns false for empty existing list', () => {
    const newP = { startDate: '2025-04-01', endDate: '2025-05-31' };
    expect(hasOverlap(newP, [])).toBe(false);
  });

  it('adjacent periods (touching but not overlapping) are not flagged', () => {
    // e1 ends 06-30, new period starts 07-01 → adjacent, no overlap
    // NOTE: hasOverlap uses strict inequality: pe < ns means [pe=06-30 < ns=07-01] → true → no overlap
    const newP = { startDate: '2025-07-01', endDate: '2025-12-31' };
    // Only e2 starts 07-01 and is open, so there IS overlap with e2
    const singleExisting: TouristTaxPeriod[] = [
      makePeriod({ id: 'e1', startDate: '2025-01-01', endDate: '2025-06-30' }),
    ];
    expect(hasOverlap(newP, singleExisting)).toBe(false);
  });
});

// ============================================================================
// sortPeriodsByDate
// ============================================================================

describe('sortPeriodsByDate', () => {
  it('returns empty array unchanged', () => {
    expect(sortPeriodsByDate([])).toEqual([]);
  });

  it('sorts periods by startDate ascending', () => {
    const p1 = makePeriod({ id: 'p1', startDate: '2025-07-01' });
    const p2 = makePeriod({ id: 'p2', startDate: '2025-01-01' });
    const result = sortPeriodsByDate([p1, p2]);
    expect(result[0].id).toBe('p2');
    expect(result[1].id).toBe('p1');
  });

  it('does not mutate the original array', () => {
    const periods = [
      makePeriod({ id: 'p1', startDate: '2025-07-01' }),
      makePeriod({ id: 'p2', startDate: '2025-01-01' }),
    ];
    const original = [...periods];
    sortPeriodsByDate(periods);
    expect(periods[0].id).toBe(original[0].id);
  });

  it('handles a single period', () => {
    const p = makePeriod({ startDate: '2025-04-01' });
    expect(sortPeriodsByDate([p])).toEqual([p]);
  });
});

// ============================================================================
// getSemesterDateBounds / isDateInSemester (IEET-001)
// ============================================================================

describe('getSemesterDateBounds', () => {
  it('returns ene–jun bounds for semester 1', () => {
    expect(getSemesterDateBounds(2026, 1)).toEqual({
      start: '2026-01-01',
      end: '2026-06-30',
    });
  });

  it('returns jul–dic bounds for semester 2', () => {
    expect(getSemesterDateBounds(2026, 2)).toEqual({
      start: '2026-07-01',
      end: '2026-12-31',
    });
  });
});

describe('isDateInSemester (IEET-001 timezone-safe)', () => {
  it('includes 1-jul in semester 2 (regression: UTC midnight vs local)', () => {
    // Before the fix, new Date('2026-07-01') (UTC) compared to
    // new Date(2026, 6, 1) (local Spain) put 1-jul into semester 1.
    expect(isDateInSemester('2026-07-01', 2026, 2)).toBe(true);
    expect(isDateInSemester('2026-07-01', 2026, 1)).toBe(false);
  });

  it('includes 1-ene in semester 1 (regression: may fall outside with Date UTC)', () => {
    expect(isDateInSemester('2026-01-01', 2026, 1)).toBe(true);
    expect(isDateInSemester('2026-01-01', 2026, 2)).toBe(false);
  });

  it('includes semester boundary end dates', () => {
    expect(isDateInSemester('2026-06-30', 2026, 1)).toBe(true);
    expect(isDateInSemester('2026-06-30', 2026, 2)).toBe(false);
    expect(isDateInSemester('2026-12-31', 2026, 2)).toBe(true);
    expect(isDateInSemester('2026-12-31', 2026, 1)).toBe(false);
  });

  it('excludes dates just outside the semester', () => {
    expect(isDateInSemester('2025-12-31', 2026, 1)).toBe(false);
    expect(isDateInSemester('2026-07-01', 2026, 1)).toBe(false);
    expect(isDateInSemester('2026-06-30', 2026, 2)).toBe(false);
    expect(isDateInSemester('2027-01-01', 2026, 2)).toBe(false);
  });

  it('uses only the YYYY-MM-DD prefix of full ISO datetimes', () => {
    expect(isDateInSemester('2026-07-01T00:00:00.000Z', 2026, 2)).toBe(true);
    expect(isDateInSemester('2026-01-01T23:59:59.999Z', 2026, 1)).toBe(true);
  });

  it('returns false for empty or malformed dates', () => {
    expect(isDateInSemester(undefined, 2026, 1)).toBe(false);
    expect(isDateInSemester(null, 2026, 1)).toBe(false);
    expect(isDateInSemester('', 2026, 1)).toBe(false);
    expect(isDateInSemester('not-a-date', 2026, 1)).toBe(false);
  });
});
