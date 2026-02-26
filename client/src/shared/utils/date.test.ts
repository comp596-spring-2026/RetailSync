import { describe, expect, it } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
  it('formats ISO date', () => {
    expect(formatDate('2026-03-01T00:00:00.000Z', 'iso')).toBe('2026-03-01');
  });

  it('returns fallback for invalid input', () => {
    expect(formatDate('not-a-date', 'iso')).toBe('-');
  });
});
