import { spawnSync } from 'node:child_process';

const MONTH_LOOKUP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

const MONTH_NAMES = Object.keys(MONTH_LOOKUP)
  .sort((left, right) => right.length - left.length)
  .join('|');

const CONTEXT_KEYWORDS = /\b(statement|period|ending|closing|from|through|summary)\b/i;
const METADATA_CONTEXT =
  /\b(modifydate|createdate|metadatadate|creationdate|moddate|xmp:|x:xmptk|pdf:producer|creatortool|documentid|instanceid|adobe xmp core|rdf:rdf|rdf:description|quadient|adobe pdf library)\b/i;

export type StatementMonthDetectionConfidence = 'high' | 'medium' | 'low' | 'none';
export type StatementMonthDetectionSource = 'pdf_text' | 'filename' | 'unknown';

export type StatementMonthDetectionResult = {
  statementMonth: string | null;
  confidence: StatementMonthDetectionConfidence;
  source: StatementMonthDetectionSource;
  summary: string;
  evidence: string | null;
  autoApply: boolean;
};

type Candidate = {
  statementMonth: string;
  score: number;
  source: Exclude<StatementMonthDetectionSource, 'unknown'>;
  evidence: string;
};

const toMonthLabel = (statementMonth: string) => {
  const [year, month] = statementMonth.split('-');
  const date = new Date(`${year}-${month}-01T00:00:00.000Z`);
  return date.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const toSnippet = (value: string, maxLength = 140) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const normalizeYear = (value: string) => {
  if (value.length === 4) return value;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return null;
  return numeric >= 70 ? `19${value}` : `20${value}`;
};

const normalizeStatementMonth = (year: string, month: string) => {
  if (!/^20\d{2}$/.test(year)) return null;
  const paddedMonth = month.padStart(2, '0');
  if (!/^(0[1-9]|1[0-2])$/.test(paddedMonth)) return null;
  return `${year}-${paddedMonth}`;
};

const extractContext = (text: string, index: number, length: number) =>
  text.slice(Math.max(0, index - 48), Math.min(text.length, index + length + 72));

const bumpCandidate = (candidates: Map<string, Candidate>, next: Candidate) => {
  const current = candidates.get(next.statementMonth);
  if (!current) {
    candidates.set(next.statementMonth, next);
    return;
  }

  current.score += next.score;
  if (next.source === 'pdf_text' && current.source !== 'pdf_text') {
    current.source = next.source;
  }
  if (next.score >= current.score || current.evidence.length < next.evidence.length) {
    current.evidence = next.evidence;
  }
};

const normalizeExtractedText = (text: string) =>
  text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 50000);

const extractPdfTextWithPdftotext = (pdfBuffer: Buffer) => {
  try {
    const result = spawnSync('pdftotext', ['-', '-'], {
      input: pdfBuffer,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.status !== 0) return null;
    const text = normalizeExtractedText(result.stdout ?? '');
    return text || null;
  } catch {
    return null;
  }
};

export const extractPdfFallbackText = (pdfBuffer: Buffer) =>
  extractPdfTextWithPdftotext(pdfBuffer) ??
  normalizeExtractedText(pdfBuffer.toString('latin1'));

const collectTextCandidates = (text: string) => {
  const candidates = new Map<string, Candidate>();

  const statementEndingRegex = /\bstatement\s+ending\s+(0[1-9]|1[0-2]|[1-9])[\/.-](0[1-9]|[12]\d|3[01])[\/.-](20\d{2}|\d{2})\b/gi;
  for (const match of text.matchAll(statementEndingRegex)) {
    const year = normalizeYear(String(match[3]));
    const statementMonth = year
      ? normalizeStatementMonth(year, String(match[1]).padStart(2, '0'))
      : null;
    if (!statementMonth || match.index == null) continue;
    const context = extractContext(text, match.index, match[0].length);
    bumpCandidate(candidates, {
      statementMonth,
      score: 8,
      source: 'pdf_text',
      evidence: toSnippet(context),
    });
  }

  const directMonthRegex = /\b(20\d{2})[-/.](0[1-9]|1[0-2])\b/g;
  for (const match of text.matchAll(directMonthRegex)) {
    const statementMonth = normalizeStatementMonth(match[1], match[2]);
    if (!statementMonth || match.index == null) continue;
    const context = extractContext(text, match.index, match[0].length);
    if (METADATA_CONTEXT.test(context)) continue;
    bumpCandidate(candidates, {
      statementMonth,
      score: CONTEXT_KEYWORDS.test(context) ? 4 : 2,
      source: 'pdf_text',
      evidence: toSnippet(context),
    });
  }

  const monthNameRegex = new RegExp(
    `\\b(${MONTH_NAMES})\\.?\\s+(?:\\d{1,2},?\\s+)?(20\\d{2})\\b`,
    'gi',
  );
  for (const match of text.matchAll(monthNameRegex)) {
    const monthToken = String(match[1] ?? '').toLowerCase().replace('.', '');
    const month = MONTH_LOOKUP[monthToken];
    const statementMonth = month ? normalizeStatementMonth(match[2], month) : null;
    if (!statementMonth || match.index == null) continue;
    const context = extractContext(text, match.index, match[0].length);
    if (METADATA_CONTEXT.test(context)) continue;
    bumpCandidate(candidates, {
      statementMonth,
      score: CONTEXT_KEYWORDS.test(context) ? 5 : 3,
      source: 'pdf_text',
      evidence: toSnippet(context),
    });
  }

  const numericDateRegex = /\b(0?[1-9]|1[0-2])[\/.-](0?[1-9]|[12]\d|3[01])[\/.-](20\d{2}|\d{2})\b/g;
  for (const match of text.matchAll(numericDateRegex)) {
    const year = normalizeYear(String(match[3]));
    const statementMonth = year
      ? normalizeStatementMonth(year, String(match[1]).padStart(2, '0'))
      : null;
    if (!statementMonth || match.index == null) continue;
    const context = extractContext(text, match.index, match[0].length);
    if (METADATA_CONTEXT.test(context)) continue;
    bumpCandidate(candidates, {
      statementMonth,
      score: CONTEXT_KEYWORDS.test(context) ? 3 : 1,
      source: 'pdf_text',
      evidence: toSnippet(context),
    });
  }

  const isoDateRegex = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
  for (const match of text.matchAll(isoDateRegex)) {
    const statementMonth = normalizeStatementMonth(match[1], match[2]);
    if (!statementMonth || match.index == null) continue;
    const context = extractContext(text, match.index, match[0].length);
    if (METADATA_CONTEXT.test(context)) continue;
    bumpCandidate(candidates, {
      statementMonth,
      score: CONTEXT_KEYWORDS.test(context) ? 3 : 1,
      source: 'pdf_text',
      evidence: toSnippet(context),
    });
  }

  return candidates;
};

const collectFilenameCandidate = (fileName: string) => {
  const normalized = fileName.replace(/\.[^.]+$/, '');

  const directMatch = normalized.match(/(?:^|[^0-9])(20\d{2})[-_. ]?(0[1-9]|1[0-2])(?:[^0-9]|$)/);
  if (directMatch) {
    const statementMonth = normalizeStatementMonth(directMatch[1], directMatch[2]);
    if (statementMonth) {
      return {
        statementMonth,
        score: 2,
        source: 'filename' as const,
        evidence: toSnippet(fileName),
      };
    }
  }

  const monthNameRegex = new RegExp(`\\b(${MONTH_NAMES})\\.?[-_. ]+(20\\d{2})\\b`, 'i');
  const monthNameMatch = normalized.match(monthNameRegex);
  if (!monthNameMatch) return null;

  const monthToken = String(monthNameMatch[1]).toLowerCase().replace('.', '');
  const month = MONTH_LOOKUP[monthToken];
  const statementMonth = month ? normalizeStatementMonth(monthNameMatch[2], month) : null;
  if (!statementMonth) return null;

  return {
    statementMonth,
    score: 2,
    source: 'filename' as const,
    evidence: toSnippet(fileName),
  };
};

export const detectStatementMonthFromPdf = ({
  pdfBuffer,
  fileName,
}: {
  pdfBuffer: Buffer;
  fileName?: string | null;
}): StatementMonthDetectionResult => {
  const candidates = collectTextCandidates(extractPdfFallbackText(pdfBuffer));
  const filenameCandidate = fileName ? collectFilenameCandidate(fileName) : null;
  if (filenameCandidate) {
    bumpCandidate(candidates, filenameCandidate);
  }

  const ranked = [...candidates.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.source === right.source) return 0;
    return right.source === 'pdf_text' ? 1 : -1;
  });

  const best = ranked[0];
  if (!best) {
    return {
      statementMonth: null,
      confidence: 'none',
      source: 'unknown',
      summary: 'Could not detect a statement month from this PDF. Choose it manually.',
      evidence: null,
      autoApply: false
    };
  }

  const nextBest = ranked[1];
  const confidence: StatementMonthDetectionConfidence =
    best.score >= 6 && (!nextBest || best.score - nextBest.score >= 2)
      ? 'high'
      : best.score >= 3
        ? 'medium'
        : 'low';

  return {
    statementMonth: best.statementMonth,
    confidence,
    source: best.source,
    summary: `This looks like a ${toMonthLabel(best.statementMonth)} statement.`,
    evidence: best.evidence || null,
    autoApply: confidence === 'high'
  };
};
