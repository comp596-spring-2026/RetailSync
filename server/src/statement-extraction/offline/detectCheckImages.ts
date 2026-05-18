import type { Box } from './types';
import { clampBoxToPage, normalizeBox } from './validateExtraction';

const DARK_THRESHOLD = 172;
const BLOCK_SIZE = 6;
const ACTIVE_BLOCK_RATIO = 0.16;

type PixelMatrix = {
  width: number;
  height: number;
  isDark: (x: number, y: number) => boolean;
};

const loadPixelMatrix = async (buffer: Buffer): Promise<PixelMatrix> => {
  const jimpMod = await import('jimp');
  const JimpCtor = (jimpMod as unknown as { Jimp?: { read: (buffer: Buffer) => Promise<any> }; default?: { read: (buffer: Buffer) => Promise<any> } }).Jimp
    ?? (jimpMod as unknown as { Jimp?: { read: (buffer: Buffer) => Promise<any> }; default?: { read: (buffer: Buffer) => Promise<any> } }).default;
  if (!JimpCtor) {
    throw new Error('Jimp is unavailable');
  }
  const intToRGBA = (jimpMod as unknown as { intToRGBA?: (value: number) => { r: number; g: number; b: number; a: number } }).intToRGBA
    ?? ((value: number) => {
      const r = (value >> 24) & 255;
      const g = (value >> 16) & 255;
      const b = (value >> 8) & 255;
      const a = value & 255;
      return { r, g, b, a };
    });

  const image = await JimpCtor.read(buffer);
  image.greyscale();

  return {
    width: image.bitmap.width,
    height: image.bitmap.height,
    isDark: (x: number, y: number) => {
      const { r } = intToRGBA(image.getPixelColor(x, y));
      return r < DARK_THRESHOLD;
    }
  };
};

const componentBoxesFromBlocks = (active: boolean[][]): Array<{ left: number; top: number; right: number; bottom: number }> => {
  const rows = active.length;
  const cols = active[0]?.length ?? 0;
  const visited = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  const boxes: Array<{ left: number; top: number; right: number; bottom: number }> = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!active[row]?.[col] || visited[row][col]) continue;

      const queue: Array<[number, number]> = [[row, col]];
      visited[row][col] = true;
      let minRow = row;
      let maxRow = row;
      let minCol = col;
      let maxCol = col;

      while (queue.length > 0) {
        const [currentRow, currentCol] = queue.shift() as [number, number];
        minRow = Math.min(minRow, currentRow);
        maxRow = Math.max(maxRow, currentRow);
        minCol = Math.min(minCol, currentCol);
        maxCol = Math.max(maxCol, currentCol);

        for (const [nextRow, nextCol] of [
          [currentRow - 1, currentCol],
          [currentRow + 1, currentCol],
          [currentRow, currentCol - 1],
          [currentRow, currentCol + 1]
        ]) {
          if (nextRow < 0 || nextCol < 0 || nextRow >= rows || nextCol >= cols) continue;
          if (!active[nextRow]?.[nextCol] || visited[nextRow][nextCol]) continue;
          visited[nextRow][nextCol] = true;
          queue.push([nextRow, nextCol]);
        }
      }

      boxes.push({
        left: minCol * BLOCK_SIZE,
        top: minRow * BLOCK_SIZE,
        right: (maxCol + 1) * BLOCK_SIZE,
        bottom: (maxRow + 1) * BLOCK_SIZE
      });
    }
  }

  return boxes;
};

const mergeNearbyBoxes = (boxes: Box[]): Box[] => {
  const sorted = [...boxes].sort((left, right) => left.top - right.top || left.left - right.left);
  const merged: Box[] = [];

  for (const box of sorted) {
    const existing = merged.find((candidate) => {
      const horizontalGap = Math.max(
        0,
        Math.max(candidate.left - (box.left + box.width), box.left - (candidate.left + candidate.width))
      );
      const verticalGap = Math.max(
        0,
        Math.max(candidate.top - (box.top + box.height), box.top - (candidate.top + candidate.height))
      );
      return horizontalGap <= 18 && verticalGap <= 24;
    });

    if (!existing) {
      merged.push({ ...box });
      continue;
    }

    const right = Math.max(existing.left + existing.width, box.left + box.width);
    const bottom = Math.max(existing.top + existing.height, box.top + box.height);
    existing.left = Math.min(existing.left, box.left);
    existing.top = Math.min(existing.top, box.top);
    existing.width = right - existing.left;
    existing.height = bottom - existing.top;
  }

  return merged;
};

export const filterCheckImageBoxes = (boxes: Box[], pageWidth: number, pageHeight: number): Box[] =>
  boxes
    .map((box) => clampBoxToPage(normalizeBox(box), pageWidth, pageHeight))
    .filter((box) => {
      const aspectRatio = box.width / box.height;
      return (
        box.width >= 180 &&
        box.height >= 45 &&
        box.height <= 280 &&
        aspectRatio >= 1.7 &&
        aspectRatio <= 7.5 &&
        box.width <= pageWidth * 0.92 &&
        box.top > 20
      );
    })
    .sort((left, right) => left.top - right.top || left.left - right.left);

export const detectCheckImageBoxes = async (pageBuffer: Buffer): Promise<Box[]> => {
  const matrix = await loadPixelMatrix(pageBuffer);
  const rows = Math.ceil(matrix.height / BLOCK_SIZE);
  const cols = Math.ceil(matrix.width / BLOCK_SIZE);
  const active = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let darkPixels = 0;
      let totalPixels = 0;
      const left = col * BLOCK_SIZE;
      const top = row * BLOCK_SIZE;
      const right = Math.min(matrix.width, left + BLOCK_SIZE);
      const bottom = Math.min(matrix.height, top + BLOCK_SIZE);

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          totalPixels += 1;
          if (matrix.isDark(x, y)) darkPixels += 1;
        }
      }

      active[row][col] = totalPixels > 0 && darkPixels / totalPixels >= ACTIVE_BLOCK_RATIO;
    }
  }

  const rawBoxes = componentBoxesFromBlocks(active).map((box) => ({
    left: box.left,
    top: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top
  }));

  return filterCheckImageBoxes(mergeNearbyBoxes(rawBoxes), matrix.width, matrix.height);
};

export const detectCaptionAnchoredImageBox = async (
  pageBuffer: Buffer,
  captionBox: Box
): Promise<Box | null> => {
  const matrix = await loadPixelMatrix(pageBuffer);
  const centerX = captionBox.left + captionBox.width / 2;
  const window = clampBoxToPage(
    {
      left: centerX - 220,
      top: captionBox.top - 320,
      width: 440,
      height: 280
    },
    matrix.width,
    matrix.height
  );

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = Math.floor(window.top); y < Math.ceil(window.top + window.height); y += 1) {
    for (let x = Math.floor(window.left); x < Math.ceil(window.left + window.width); x += 1) {
      if (!matrix.isDark(x, y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const inferred = clampBoxToPage(
    {
      left: minX - 10,
      top: minY - 10,
      width: maxX - minX + 20,
      height: maxY - minY + 20
    },
    matrix.width,
    matrix.height
  );

  const filtered = filterCheckImageBoxes([inferred], matrix.width, matrix.height);
  return filtered[0] ?? null;
};
