import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHECK_IMAGE_PRESET,
  buildFallbackManualCheckSlots,
  computeManualCheckSlot,
  detectCheckImagePages,
  detectCheckImagePagesAfterDailyBalances,
  findLastDailyBalancePageNumber,
  isCheckImagePageText,
  isDailyBalancePageText,
  isLikelyChecksClearedTableCrop,
  isLikelyTableRowCropBox,
  resolveCheckImageCropPlacement,
  resolveDefaultCheckFallbackStartPage
} from './accountingCheckLayoutService';

describe('accountingCheckLayoutService', () => {
  describe('isCheckImagePageText', () => {
    it('returns true for a page that looks like a grid of imaged checks', () => {
      const text = [
        '#0321 12/02 $1,245.00',
        '#0322 12/03 $375.00',
        '#0323 12/05 $88.40',
        '#0324 12/05 $2,014.78',
        '#0325 12/08 $540.00'
      ].join('\n');
      expect(isCheckImagePageText(text)).toBe(true);
    });

    it('returns false for a Checks Cleared summary page', () => {
      const text = [
        'Checks Cleared',
        '0321 12/02 $1,245.00',
        '0322 12/03 $375.00',
        '0323 12/05 $88.40',
        '0324 12/05 $2,014.78'
      ].join('\n');
      expect(isCheckImagePageText(text)).toBe(false);
    });

    it('returns false for a transactions page', () => {
      const text = [
        'Account Summary',
        'Electronic Credits',
        'Description Amount',
        'ACH CREDIT $1,200.00',
        'WIRE TRANSFER $5,000.00'
      ].join('\n');
      expect(isCheckImagePageText(text)).toBe(false);
    });

    it('returns false for an empty page', () => {
      expect(isCheckImagePageText('')).toBe(false);
    });
  });

  describe('detectCheckImagePages', () => {
    it('returns only pages classified as check-image pages, in ascending order', () => {
      const pages = [
        { pageNumber: 1, text: 'Account Summary Beginning Balance $10,000.00' },
        { pageNumber: 2, text: 'Electronic Credits Description Amount ACH $1,200.00' },
        {
          pageNumber: 5,
          text: '#0321 12/02 $1,245.00 #0322 12/03 $375.00 #0323 12/05 $88.40 #0324 12/05 $2,014.78'
        },
        { pageNumber: 3, text: 'Checks Cleared 0321 12/02 $1,245.00 0322 12/03 $375.00' },
        {
          pageNumber: 4,
          text: '#0319 12/01 $210.00 #0320 12/02 $650.00 #0321 12/02 $1,245.00 #0322 12/03 $375.00'
        }
      ];

      expect(detectCheckImagePages(pages)).toEqual([4, 5]);
    });

    it('includes pages after Daily Balances when check OCR tokens are sparse', () => {
      const pages = [
        { pageNumber: 1, text: 'Account Summary Beginning Balance $10,000.00' },
        { pageNumber: 2, text: 'Checks Cleared 0321 12/02 $1,245.00 0322 12/03 $375.00' },
        {
          pageNumber: 3,
          text: 'Daily Balances 12/01 $1,000.00 12/02 $1,100.00 ending balance forward'
        },
        { pageNumber: 4, text: 'check image scan page with little text' },
        { pageNumber: 5, text: 'second check image page' }
      ];

      expect(findLastDailyBalancePageNumber(pages)).toBe(3);
      expect(detectCheckImagePagesAfterDailyBalances(pages)).toEqual([4, 5]);
      expect(detectCheckImagePages(pages)).toEqual([4, 5]);
      expect(resolveDefaultCheckFallbackStartPage(pages)).toBe(4);
    });

    it('stops after Daily Balances when a summary section appears', () => {
      const pages = [
        { pageNumber: 3, text: 'Daily Balances 12/01 $500.00 12/02 $600.00' },
        { pageNumber: 4, text: 'check scans' },
        { pageNumber: 5, text: 'Account Summary ending balance $12,000.00' }
      ];

      expect(detectCheckImagePagesAfterDailyBalances(pages)).toEqual([4]);
    });
  });

  describe('isDailyBalancePageText', () => {
    it('recognizes a daily balance table page', () => {
      expect(
        isDailyBalancePageText('Daily Balances 12/01 $1,000.00 12/02 $1,100.00 ending balance')
      ).toBe(true);
    });

    it('rejects a page that is mostly imaged checks', () => {
      const text = '#0321 $1,245.00 #0322 $375.00 #0323 $88.40 #0324 $2,014.78';
      expect(isDailyBalancePageText(text)).toBe(false);
    });
  });

  describe('buildFallbackManualCheckSlots', () => {
    it('distributes checks across detected pages using the default grid', () => {
      const checkNumbers = Array.from({ length: 20 }, (_, index) =>
        String(100 + index).padStart(4, '0')
      );
      const slots = buildFallbackManualCheckSlots(checkNumbers, {
        pages: [7, 8],
        defaultPreset: DEFAULT_CHECK_IMAGE_PRESET
      });

      expect(slots).toHaveLength(20);
      const page7 = slots.filter((slot) => slot.pageNumber === 7);
      const page8 = slots.filter((slot) => slot.pageNumber === 8);
      expect(page7).toHaveLength(18);
      expect(page8).toHaveLength(2);

      const firstBox = page7[0].bbox;
      expect(firstBox.left).toBe(DEFAULT_CHECK_IMAGE_PRESET.left);
      expect(firstBox.top).toBe(DEFAULT_CHECK_IMAGE_PRESET.rowTop);

      for (const slot of slots) {
        expect(slot.bbox.right).toBeGreaterThan(slot.bbox.left);
        expect(slot.bbox.bottom).toBeGreaterThan(slot.bbox.top);
      }
    });

    it('still supports legacy preset-map signature for backwards compatibility', () => {
      const slots = buildFallbackManualCheckSlots(['0100', '0101', '0102']);
      expect(slots.every((slot) => [4, 5, 6].includes(slot.pageNumber))).toBe(true);
      expect(slots).toHaveLength(3);
    });

    it('returns an empty array when no pages are provided', () => {
      expect(
        buildFallbackManualCheckSlots(['0100'], { pages: [], defaultPreset: DEFAULT_CHECK_IMAGE_PRESET })
      ).toEqual([]);
    });
  });

  describe('computeManualCheckSlot', () => {
    const preset = DEFAULT_CHECK_IMAGE_PRESET;
    const cellsPerPage = preset.columns * preset.rows;

    it('places the first check in the top-left cell of the fallback start page', () => {
      const slot = computeManualCheckSlot(0, { fallbackStartPage: 4 });
      expect(slot).not.toBeNull();
      expect(slot?.pageNumber).toBe(4);
      expect(slot?.bbox.left).toBe(preset.left);
      expect(slot?.bbox.top).toBe(preset.rowTop);
    });

    it('rolls to the next page when an overflow index is given', () => {
      const slot = computeManualCheckSlot(cellsPerPage, { fallbackStartPage: 4 });
      expect(slot?.pageNumber).toBe(5);
      expect(slot?.bbox.left).toBe(preset.left);
      expect(slot?.bbox.top).toBe(preset.rowTop);
    });

    it('uses detected pages in order before incrementing', () => {
      const first = computeManualCheckSlot(0, { pages: [7, 9] });
      const last = computeManualCheckSlot(cellsPerPage * 2 + 1, { pages: [7, 9] });
      expect(first?.pageNumber).toBe(7);
      expect(last?.pageNumber).toBe(10);
    });

    it('returns null for invalid indexes', () => {
      expect(computeManualCheckSlot(-1)).toBeNull();
      expect(computeManualCheckSlot(Number.NaN)).toBeNull();
    });
  });

  describe('check crop placement', () => {
    it('flags wide flat regions as checks-cleared table rows', () => {
      expect(isLikelyTableRowCropBox({ left: 40, top: 200, right: 900, bottom: 240 })).toBe(true);
      expect(isLikelyTableRowCropBox({ left: 100, top: 140, right: 400, bottom: 320 })).toBe(false);
    });

    it('prefers parser bboxes over grid slots when a region is available', () => {
      const gridSlot = computeManualCheckSlot(0, { pages: [8], fallbackStartPage: 8 });
      const placement = resolveCheckImageCropPlacement({
        checkNumber: '97',
        detectedCheckPages: [8, 9],
        manualSlot: gridSlot,
        parserBBox: [40, 180, 120, 620],
        parserPageNumber: 3,
        parserRegionText: '97 12/03/2025 305.84\n98 12/02/2025 55.00'
      });
      expect(placement?.source).toBe('ocr_region');
      expect(placement?.pageNumber).toBe(3);
    });

    it('allows parser bboxes on detected check-image pages', () => {
      const placement = resolveCheckImageCropPlacement({
        detectedCheckPages: [8],
        parserBBox: [100, 140, 400, 320],
        parserPageNumber: 8,
        parserRegionText: '#0097 12/03 $305.84'
      });
      expect(placement?.source).toBe('ocr_region');
      expect(placement?.cropBBox).toEqual([100, 140, 400, 320]);
    });
  });
});
