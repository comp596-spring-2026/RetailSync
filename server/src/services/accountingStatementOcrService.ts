import { env } from '../config/env';
import { ocrImageWithVision, type OcrBoundingBox, type OcrPageObservation } from '../integrations/google/visionOcr.client';
import type { CheckCropBox } from './accountingCheckCropService';

export type StatementPageOcrArgs = {
  pageNumber: number;
  imageBuffer: Buffer;
  mimeType?: string;
};

export type StatementPageObservation = OcrPageObservation & {
  pageNumber: number;
};

export type CheckRegionCandidate = {
  pageNumber: number;
  bbox: CheckCropBox;
  score: number;
  confidence: number;
  reasons: string[];
  text: string;
};

type ScoredCheckRegionUnit = {
  text: string;
  bbox: CheckCropBox;
  score: number;
  reasons: string[];
};

const CHECK_KEYWORDS = [
  /\bpay to the order of\b/i,
  /\bcheck\b/i,
  /\bcheque\b/i,
  /\bchk\b/i,
  /\bmemo\b/i,
  /\bdate\b/i,
  /\bamount\b/i,
  /\breimburse(?:ment)?\b/i,
  /\bpayroll\b/i,
  /\binvoice\b/i,
  /\bvendor\b/i
];

const DATE_RE = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|20\d{2}-\d{2}-\d{2})\b/;
const MONEY_RE = /(?:-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+(?:\.\d{2}))/;
const CHECK_NUMBER_RE = /\b(?:check|chk|cheque)\s*(?:no\.?|number|#)?\s*[:\-]?\s*(\d{2,8})\b/i;

const boxArea = (bbox: CheckCropBox) => Math.max(1, (bbox.right - bbox.left) * (bbox.bottom - bbox.top));

const unionBoxes = (boxes: CheckCropBox[]) => {
  const left = Math.min(...boxes.map((bbox) => bbox.left));
  const top = Math.min(...boxes.map((bbox) => bbox.top));
  const right = Math.max(...boxes.map((bbox) => bbox.right));
  const bottom = Math.max(...boxes.map((bbox) => bbox.bottom));
  return { left, top, right, bottom };
};

const expandBox = (bbox: CheckCropBox, marginPx: number): CheckCropBox => ({
  left: Math.max(0, Math.floor(bbox.left - marginPx)),
  top: Math.max(0, Math.floor(bbox.top - marginPx)),
  right: Math.max(Math.floor(bbox.left - marginPx) + 1, Math.ceil(bbox.right + marginPx)),
  bottom: Math.max(Math.floor(bbox.top - marginPx) + 1, Math.ceil(bbox.bottom + marginPx))
});

const bboxToString = (bbox: CheckCropBox) =>
  `${Math.round(bbox.left)},${Math.round(bbox.top)}-${Math.round(bbox.right)},${Math.round(bbox.bottom)}`;

const scoreText = (text: string) => {
  const normalized = String(text ?? '').trim();
  let score = 0;
  const reasons: string[] = [];

  if (CHECK_NUMBER_RE.test(normalized)) {
    score += 4;
    reasons.push('Contains a check number signal');
  }
  if (MONEY_RE.test(normalized)) {
    score += 3;
    reasons.push('Contains a currency amount signal');
  }
  if (DATE_RE.test(normalized)) {
    score += 2;
    reasons.push('Contains a date signal');
  }
  for (const keyword of CHECK_KEYWORDS) {
    if (keyword.test(normalized)) {
      score += 1;
      reasons.push(`Matched keyword: ${String(keyword).replace(/\\/g, '')}`);
    }
  }

  return { score, reasons };
};

const getUnits = (page: StatementPageObservation) => {
  if (page.paragraphs.length > 0) return page.paragraphs;
  if (page.blocks.length > 0) return page.blocks;
  return page.words;
};

const sortByTop = (left: { bbox: CheckCropBox }, right: { bbox: CheckCropBox }) =>
  left.bbox.top - right.bbox.top || left.bbox.left - right.bbox.left;

const clusterUnits = (units: ScoredCheckRegionUnit[]) => {
  if (units.length === 0) return [];
  const sorted = [...units].sort(sortByTop);
  const clusters: ScoredCheckRegionUnit[][] = [];

  let current: ScoredCheckRegionUnit[] = [sorted[0]];
  let currentBottom = sorted[0].bbox.bottom;

  for (const unit of sorted.slice(1)) {
    const verticalGap = unit.bbox.top - currentBottom;
    if (verticalGap <= 90) {
      current.push(unit);
      currentBottom = Math.max(currentBottom, unit.bbox.bottom);
      continue;
    }

    clusters.push(current);
    current = [unit];
    currentBottom = unit.bbox.bottom;
  }

  clusters.push(current);
  return clusters;
};

const pageBounds = (page: StatementPageObservation) => {
  const units = getUnits(page);
  if (units.length === 0) {
    return null;
  }

  return unionBoxes(units.map((unit) => unit.bbox));
};

export const ocrStatementPageImage = async (args: StatementPageOcrArgs): Promise<StatementPageObservation> => {
  const result = await ocrImageWithVision({
    imageBuffer: args.imageBuffer,
    mimeType: args.mimeType ?? 'image/png',
    timeoutMs: env.statementOcrTimeoutMs
  });

  return {
    ...result,
    pageNumber: args.pageNumber
  };
};

export const detectCheckRegionsFromPageOcr = (
  page: StatementPageObservation,
  options?: {
    marginPx?: number;
    minScore?: number;
    maxCandidates?: number;
  }
) => {
  const marginPx = options?.marginPx ?? env.statementCheckRegionMarginPx;
  const minScore = options?.minScore ?? env.statementCheckRegionMinScore;
  const maxCandidates = options?.maxCandidates ?? env.statementCheckRegionMaxCandidates;
  const units = getUnits(page);

  const scoredUnits = units
    .map((unit) => {
      const { score, reasons } = scoreText(unit.text);
      return {
        ...unit,
        score,
        reasons
      };
    })
    .filter((unit) => unit.score >= 2);

  const clusters = clusterUnits(scoredUnits);
  const candidates: CheckRegionCandidate[] = [];
  const fallbackBounds = pageBounds(page);

  for (const cluster of clusters) {
    const texts = cluster.map((unit) => unit.text.trim()).filter(Boolean);
    const text = texts.join(' ').trim();
    const scoreResult = scoreText(text);
    const clusterScore = cluster.reduce((total, unit) => total + unit.score, 0) + scoreResult.score;
    const reasons = Array.from(new Set([...cluster.flatMap((unit) => unit.reasons), ...scoreResult.reasons]));

    if (clusterScore < minScore * 10) {
      continue;
    }

    const merged = unionBoxes(cluster.map((unit) => unit.bbox));
    const bbox = expandBox(merged, marginPx);
    const confidence = Math.min(0.99, Math.max(0.4, clusterScore / 12));

    candidates.push({
      pageNumber: page.pageNumber,
      bbox,
      score: Number(clusterScore.toFixed(2)),
      confidence: Number(confidence.toFixed(2)),
      reasons: reasons.length > 0 ? reasons : ['OCR text matched check-like layout'],
      text
    });
  }

  if (candidates.length === 0 && fallbackBounds) {
    const scoreResult = scoreText(page.text);
    if (scoreResult.score > 0) {
      candidates.push({
        pageNumber: page.pageNumber,
        bbox: expandBox(fallbackBounds, marginPx),
        score: Number(scoreResult.score.toFixed(2)),
        confidence: Number(Math.min(0.7, Math.max(0.35, scoreResult.score / 10)).toFixed(2)),
        reasons: [...scoreResult.reasons, 'Used fallback page bounds because line-level OCR was unavailable'],
        text: page.text.trim()
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || boxArea(left.bbox) - boxArea(right.bbox))
    .slice(0, maxCandidates)
    .map((candidate) => ({
      ...candidate,
      bbox: {
        left: candidate.bbox.left,
        top: candidate.bbox.top,
        right: candidate.bbox.right,
        bottom: candidate.bbox.bottom
      },
      anchor: bboxToString(candidate.bbox)
    }));
};

export const ocrStatementPages = async (pages: Array<{ pageNumber: number; imageBuffer: Buffer; mimeType?: string }>) =>
  Promise.all(
    pages.map(async (page) => {
      const observation = await ocrStatementPageImage(page);
      return {
        ...observation,
        checkRegions: detectCheckRegionsFromPageOcr(observation)
      };
    })
  );
