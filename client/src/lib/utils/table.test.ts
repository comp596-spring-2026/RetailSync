import { describe, expect, it } from 'vitest';
import { clampPage, paginateRows } from './table';

describe('table utils', () => {
  it('clamps page to bounds', () => {
    expect(clampPage(9, 12, 5)).toBe(2);
    expect(clampPage(-1, 12, 5)).toBe(0);
  });

  it('paginates rows', () => {
    const rows = [1, 2, 3, 4, 5, 6];
    expect(paginateRows(rows, 1, 2)).toEqual([3, 4]);
  });
});
