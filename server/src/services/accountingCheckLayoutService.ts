import type { CheckCropBox } from './accountingCheckCropService';

export type ManualCheckLayoutPreset = {
  columns: number;
  rows: number;
  left: number;
  right: number;
  rowTop: number;
  rowHeight: number;
  rowGap: number;
};

// Pixel coordinates assume the statement PDF is rendered at the project's
// configured statement PDF render DPI (default 144). This
// 3x6 layout was calibrated against SouthState statement check-image pages,
// but the same shape is the norm for most US bank statement check images,
// so we use it as the default template for any page we classify as a
// "check image page".
export const DEFAULT_CHECK_IMAGE_PRESET: ManualCheckLayoutPreset = {
  columns: 3,
  rows: 6,
  left: 97,
  right: 1160,
  rowTop: 137,
  rowHeight: 155,
  rowGap: 86
};

// Retained for backwards-compatibility with the fixture script. New code
// should prefer detecting pages dynamically via `detectCheckImagePages` and
// building presets per detected page at runtime.
export const MANUAL_CHECK_LAYOUT_PRESETS: Record<number, ManualCheckLayoutPreset> = {
  4: DEFAULT_CHECK_IMAGE_PRESET,
  5: DEFAULT_CHECK_IMAGE_PRESET,
  6: DEFAULT_CHECK_IMAGE_PRESET
};

export type ManualCheckCropResult = {
  checkNumber: string;
  bbox: CheckCropBox;
};

export type ManualCheckSlot = ManualCheckCropResult & {
  pageNumber: number;
};

export const buildManualCheckCropBoxes = (args: {
  pageNumber: number;
  checkNumbers: string[];
  presets?: Record<number, ManualCheckLayoutPreset>;
  preset?: ManualCheckLayoutPreset;
}): ManualCheckCropResult[] => {
  const preset =
    args.preset ??
    (args.presets ?? MANUAL_CHECK_LAYOUT_PRESETS)[args.pageNumber] ??
    null;
  if (!preset) return [];

  const sortedCheckNumbers = [...args.checkNumbers]
    .filter((value) => value && value !== '0000')
    .sort((left, right) => Number(left) - Number(right));

  const totalWidth = preset.right - preset.left;
  const cellWidth = Math.floor(totalWidth / preset.columns);

  return sortedCheckNumbers.slice(0, preset.columns * preset.rows).map((checkNumber, index) => {
    const row = Math.floor(index / preset.columns);
    const column = index % preset.columns;
    const left = preset.left + column * cellWidth;
    const right = column === preset.columns - 1 ? preset.right : preset.left + (column + 1) * cellWidth;
    const top = preset.rowTop + row * (preset.rowHeight + preset.rowGap);
    const bottom = top + preset.rowHeight;

    return {
      checkNumber,
      bbox: { left, top, right, bottom }
    };
  });
};

// Distribute a full ordered list of check numbers across a set of check-image
// pages in ascending page order, filling each page's grid before moving on.
// Accepts either a preset-map (legacy — hardcoded pages) OR a list of
// detected page numbers (preferred — pages classified at runtime as check
// image pages). When detected pages are provided, DEFAULT_CHECK_IMAGE_PRESET
// is applied to each unless a page-specific preset is supplied.
export const buildFallbackManualCheckSlots = (
  checkNumbers: string[],
  options:
    | Record<number, ManualCheckLayoutPreset>
    | {
        pages: number[];
        presetByPage?: Record<number, ManualCheckLayoutPreset>;
        defaultPreset?: ManualCheckLayoutPreset;
      } = MANUAL_CHECK_LAYOUT_PRESETS
): ManualCheckSlot[] => {
  const { orderedPages, resolvePreset } = resolveLayoutOptions(options);

  const slots: ManualCheckSlot[] = [];
  let cursor = 0;

  for (const pageNumber of orderedPages) {
    const preset = resolvePreset(pageNumber);
    if (!preset) continue;
    const capacity = preset.columns * preset.rows;
    const batch = checkNumbers.slice(cursor, cursor + capacity);
    cursor += capacity;
    if (batch.length === 0) continue;
    const boxes = buildManualCheckCropBoxes({ pageNumber, checkNumbers: batch, preset });
    slots.push(...boxes.map((box) => ({ ...box, pageNumber })));
  }

  return slots;
};

const resolveLayoutOptions = (
  options:
    | Record<number, ManualCheckLayoutPreset>
    | {
        pages: number[];
        presetByPage?: Record<number, ManualCheckLayoutPreset>;
        defaultPreset?: ManualCheckLayoutPreset;
      }
): {
  orderedPages: number[];
  resolvePreset: (pageNumber: number) => ManualCheckLayoutPreset | null;
} => {
  if (Array.isArray((options as { pages?: number[] }).pages)) {
    const typed = options as {
      pages: number[];
      presetByPage?: Record<number, ManualCheckLayoutPreset>;
      defaultPreset?: ManualCheckLayoutPreset;
    };
    const orderedPages = [...new Set(typed.pages)]
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);
    const fallbackPreset = typed.defaultPreset ?? DEFAULT_CHECK_IMAGE_PRESET;
    const resolvePreset = (pageNumber: number) =>
      typed.presetByPage?.[pageNumber] ?? fallbackPreset;
    return { orderedPages, resolvePreset };
  }

  const presets = options as Record<number, ManualCheckLayoutPreset>;
  const orderedPages = Object.keys(presets)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const resolvePreset = (pageNumber: number) => presets[pageNumber] ?? null;
  return { orderedPages, resolvePreset };
};

export type CheckPageClassificationInput = {
  pageNumber: number;
  text: string;
};

const normalize = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim();

// Returns true when the given page's text looks like a page of imaged checks
// rather than a text-only transactions or "Checks cleared" summary page.
// Heuristics mirror the fixture extraction script (runStatementFixtureExtraction.ts):
//   - at least 4 check-number tokens like `#1234`
//   - at least 4 currency tokens
//   - no "checks cleared" table header
//   - no obvious transactions-section headers
export const isCheckImagePageText = (text: string): boolean => {
  const compact = normalize(text);
  if (!compact) return false;
  if (/checks\s+cleared/i.test(compact)) return false;
  if (
    /account\s+summary|deposits\s+and\s+other\s+credits|electronic\s+credits|electronic\s+debits|other\s+credits|other\s+debits|description|daily\s+balance/i.test(
      compact
    )
  ) {
    return false;
  }
  const checkTokens = compact.match(/#\s*0*\d{2,4}\b/g) ?? [];
  const amountTokens = compact.match(/\$\s*\d[\d,]*\.\d{2}/g) ?? [];
  return checkTokens.length >= 4 && amountTokens.length >= 4;
};

export const detectCheckImagePages = (
  pages: CheckPageClassificationInput[]
): number[] =>
  pages
    .filter((page) => isCheckImagePageText(page.text ?? ''))
    .map((page) => Number(page.pageNumber))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

// Deterministic grid slot for the Nth check in the ordered list. Guarantees
// that EVERY check lands on a page + bbox, regardless of whether OCR-based
// page classification found anything. Used as the final fallback in
// checks.spawn so `check.process` never has to bail out with "crop box missing".
//
// Behavior:
//   - Uses DEFAULT_CHECK_IMAGE_PRESET (SouthState 3x6 grid) as the layout.
//   - If `pages` is provided (e.g. detected check-image pages), uses those in
//     order; each extra page of checks rolls over to the next page.
//   - If no pages are provided, starts at `fallbackStartPage` (default 4 —
//     the typical first check-image page for SouthState) and increments one
//     page at a time for overflow.
export type CheckCropBoxTuple = [number, number, number, number];

export const toCheckCropBox = (bbox: CheckCropBox | CheckCropBoxTuple): CheckCropBox => {
  if (Array.isArray(bbox)) {
    return {
      left: Number(bbox[0]),
      top: Number(bbox[1]),
      right: Number(bbox[2]),
      bottom: Number(bbox[3])
    };
  }
  return bbox;
};

export const toCheckCropBoxTuple = (bbox: CheckCropBox): CheckCropBoxTuple => [
  bbox.left,
  bbox.top,
  bbox.right,
  bbox.bottom
];

/** Wide, flat regions are usually checks-cleared table rows — not check thumbnails. */
export const isLikelyTableRowCropBox = (bbox: CheckCropBox | CheckCropBoxTuple) => {
  const box = toCheckCropBox(bbox);
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width <= 0 || height <= 0) return true;
  const aspect = width / height;
  if (height < 48) return true;
  if (aspect > 10 && height < 120) return true;
  return false;
};

export const isLikelyChecksClearedTableCrop = (args: {
  bbox: CheckCropBox | CheckCropBoxTuple;
  regionText?: string;
}) => {
  if (isLikelyTableRowCropBox(args.bbox)) return true;
  const text = String(args.regionText ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return false;
  if (/checks\s+cleared/i.test(text)) return true;
  const bareTableLines = text.match(/\b\d{2,8}\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g) ?? [];
  const hashCheckLines = text.match(/#\s*0*\d{2,8}\b/g) ?? [];
  return bareTableLines.length >= 3 && hashCheckLines.length === 0;
};

export type CheckImageCropPlacement = {
  pageNumber: number;
  cropBBox: CheckCropBoxTuple;
  cropImagePath?: string;
  source: 'offline_crop' | 'offline_box' | 'grid' | 'ocr_region';
};

export const resolveCheckImageCropPlacement = (args: {
  checkNumber?: string;
  detectedCheckPages: number[];
  manualSlot?: ManualCheckSlot | null;
  offlineImage?: {
    page?: number;
    imageBox?: { left?: number; top?: number; width?: number; height?: number };
    reviewCropPath?: string;
  } | null;
  parserBBox?: CheckCropBoxTuple;
  parserPageNumber?: number;
  parserRegionText?: string;
}): CheckImageCropPlacement | null => {
  const manualSlot = args.manualSlot ?? null;
  const offline = args.offlineImage ?? null;

  if (offline?.reviewCropPath && offline.imageBox) {
    const box = {
      left: Number(offline.imageBox.left ?? 0),
      top: Number(offline.imageBox.top ?? 0),
      right: Number(offline.imageBox.left ?? 0) + Number(offline.imageBox.width ?? 0),
      bottom: Number(offline.imageBox.top ?? 0) + Number(offline.imageBox.height ?? 0)
    };
    if (!isLikelyChecksClearedTableCrop({ bbox: box })) {
      return {
        pageNumber: Number(offline.page ?? args.parserPageNumber ?? manualSlot?.pageNumber ?? 1),
        cropBBox: toCheckCropBoxTuple(box),
        cropImagePath: offline.reviewCropPath,
        source: 'offline_crop'
      };
    }
  }

  if (manualSlot && !isLikelyChecksClearedTableCrop({ bbox: manualSlot.bbox })) {
    return {
      pageNumber: manualSlot.pageNumber,
      cropBBox: toCheckCropBoxTuple(manualSlot.bbox),
      source: 'grid'
    };
  }

  if (offline?.imageBox) {
    const box = {
      left: Number(offline.imageBox.left ?? 0),
      top: Number(offline.imageBox.top ?? 0),
      right: Number(offline.imageBox.left ?? 0) + Number(offline.imageBox.width ?? 0),
      bottom: Number(offline.imageBox.top ?? 0) + Number(offline.imageBox.height ?? 0)
    };
    if (!isLikelyChecksClearedTableCrop({ bbox: box })) {
      return {
        pageNumber: Number(offline.page ?? args.parserPageNumber ?? 1),
        cropBBox: toCheckCropBoxTuple(box),
        cropImagePath: offline.reviewCropPath,
        source: 'offline_box'
      };
    }
  }

  if (args.parserBBox && args.parserPageNumber != null) {
    const pageNumber = Number(args.parserPageNumber);
    const onCheckImagePage = args.detectedCheckPages.includes(pageNumber);
    const parserBox = toCheckCropBox(args.parserBBox);
    const tableLike = isLikelyChecksClearedTableCrop({
      bbox: parserBox,
      regionText: args.parserRegionText
    });
    if (onCheckImagePage && !tableLike) {
      return {
        pageNumber,
        cropBBox: args.parserBBox,
        source: 'ocr_region'
      };
    }
  }

  return null;
};

export const computeManualCheckSlot = (
  index: number,
  options: {
    pages?: number[];
    fallbackStartPage?: number;
    preset?: ManualCheckLayoutPreset;
  } = {}
): ManualCheckSlot | null => {
  if (!Number.isFinite(index) || index < 0) return null;
  const preset = options.preset ?? DEFAULT_CHECK_IMAGE_PRESET;
  const cellsPerPage = preset.columns * preset.rows;
  if (cellsPerPage <= 0) return null;

  const pageOffset = Math.floor(index / cellsPerPage);
  const pagesList = Array.isArray(options.pages) && options.pages.length > 0 ? options.pages : null;
  const pageNumber = pagesList
    ? pagesList[Math.min(pageOffset, pagesList.length - 1)] + Math.max(0, pageOffset - (pagesList.length - 1))
    : (options.fallbackStartPage ?? 4) + pageOffset;

  const localIndex = index % cellsPerPage;
  const row = Math.floor(localIndex / preset.columns);
  const column = localIndex % preset.columns;
  const totalWidth = preset.right - preset.left;
  const cellWidth = Math.floor(totalWidth / preset.columns);
  const left = preset.left + column * cellWidth;
  const right = column === preset.columns - 1 ? preset.right : preset.left + (column + 1) * cellWidth;
  const top = preset.rowTop + row * (preset.rowHeight + preset.rowGap);
  const bottom = top + preset.rowHeight;

  return {
    checkNumber: '',
    pageNumber,
    bbox: { left, top, right, bottom }
  };
};
