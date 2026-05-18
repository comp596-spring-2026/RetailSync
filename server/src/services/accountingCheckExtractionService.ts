import { getStorageClient } from '../integrations/google/storage.client';
import {
  buildCheckCropPath,
  buildCheckOcrPath,
  buildCheckStructuredPath
} from './accountingStorageService';
import {
  renderAndPersistCheckCrop,
  renderCheckCropFromPdf,
  type CheckCropBox,
  type RenderedCheckCrop
} from './accountingCheckCropService';
import { env } from '../config/env';

export type StatementCheckExtracted = {
  checkNumber?: string;
  date?: string;
  payeeName?: string;
  amount?: number;
  memo?: string;
  source: 'ocr' | 'deterministic' | 'legacy' | 'pdf_text';
};

export type StatementCheckConfidence = {
  imageQuality: number;
  ocrConfidence: number;
  fieldConfidence: number;
  crossValidation: number;
  overall: number;
};

export type StatementCheckExtractionResult = {
  crop: RenderedCheckCrop;
  ocr: StatementCheckOcrObservation;
  extracted: StatementCheckExtracted;
  confidence: StatementCheckConfidence;
  reasons: string[];
  artifacts: {
    cropImagePath?: string;
    ocrTextPath?: string;
    ocrJsonPath?: string;
    structuredPath?: string;
  };
};

export type StatementCheckOcrObservation = {
  provider: 'tesseract' | 'pdf_text';
  text: string;
  blocks: [];
  paragraphs: [];
  words: [];
  raw: Record<string, unknown>;
};

export type RunStatementCheckExtractionArgs = {
  pdfBuffer: Buffer;
  pageNumber: number;
  cropBox: CheckCropBox;
  checkKey: string;
  pageContext?: string;
  fallback?: Partial<StatementCheckExtracted>;
  /** When set, check field parsing uses this statement PDF page text instead of any cloud OCR. */
  internalPdfPageText?: string;
  bucketName?: string;
  rootPrefix?: string;
  persistArtifacts?: boolean;
};

const DATE_RE = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|20\d{2}-\d{2}-\d{2})\b/;
const MONEY_RE = /(?:-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+(?:\.\d{2}))/g;

const normalizeAmount = (value: string) =>
  Number(String(value).replace(/[$,]/g, '').replace(/^\((.*)\)$/, '-$1'));

const normalizeDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return null;
  const yearRaw = match[3];
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  if (!/^20\d{2}$/.test(year)) return null;
  return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
};

const normalizeLines = (text: string) =>
  String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const pickCheckNumber = (lines: string[]) => {
  const matchers = [
    /\b(?:check|chk|cheque)\s*(?:no\.?|number|#)?\s*[:\-]?\s*(\d{2,8})\b/i,
    /\b(?:no\.?|number|#)\s*[:\-]?\s*(\d{2,8})\b/i
  ];

  for (const line of lines) {
    for (const matcher of matchers) {
      const match = line.match(matcher);
      if (match?.[1]) return match[1];
    }
  }

  return undefined;
};

const pickDate = (lines: string[]) => {
  for (const line of lines) {
    const match = line.match(DATE_RE);
    if (match?.[0]) {
      const normalized = normalizeDate(match[0]);
      if (normalized) return normalized;
    }
  }
  return undefined;
};

const pickAmount = (lines: string[]) => {
  const amountCandidates: Array<{ value: number; line: string; score: number }> = [];

  for (const line of lines) {
    const matches = line.match(MONEY_RE) ?? [];
    for (const match of matches) {
      const value = normalizeAmount(match);
      if (!Number.isFinite(value)) continue;

      let score = 1;
      if (/\bamount\b/i.test(line)) score += 2;
      if (/\bcheck\b/i.test(line)) score += 1;
      if (/\bpay to the order of\b/i.test(line)) score += 1;
      amountCandidates.push({ value, line, score });
    }
  }

  amountCandidates.sort((left, right) => right.score - left.score || Math.abs(right.value) - Math.abs(left.value));
  return amountCandidates[0]?.value;
};

const pickPayee = (lines: string[], pageContext?: string) => {
  const payeePatterns = [
    /pay to the order of\s+(.+?)(?:\s{2,}|memo\b|date\b|check\b|amount\b|$)/i,
    /pay to order of\s+(.+?)(?:\s{2,}|memo\b|date\b|check\b|amount\b|$)/i
  ];

  const searchSpace = [...lines, ...normalizeLines(pageContext ?? '')];
  for (const line of searchSpace) {
    for (const pattern of payeePatterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const candidate = match[1].trim();
        if (candidate) return candidate.replace(/\s{2,}/g, ' ');
      }
    }
  }

  const lineAfterLabel = lines.findIndex((line) => /pay to the order of/i.test(line));
  if (lineAfterLabel >= 0 && lines[lineAfterLabel + 1]) {
    return lines[lineAfterLabel + 1].replace(/\s{2,}/g, ' ').trim();
  }

  return undefined;
};

const pickMemo = (lines: string[]) => {
  for (const line of lines) {
    const match = line.match(/\bmemo\b\s*[:\-]?\s*(.+)$/i) ?? line.match(/\bfor\b\s*[:\-]?\s*(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
};

const buildConfidence = (args: {
  extracted: StatementCheckExtracted;
  cropText: string;
  crossValidationHit: boolean;
}) => {
  const hasCheckNumber = Boolean(args.extracted.checkNumber);
  const hasDate = Boolean(args.extracted.date);
  const hasPayee = Boolean(args.extracted.payeeName);
  const hasAmount = typeof args.extracted.amount === 'number' && Number.isFinite(args.extracted.amount);

  const fieldCount = [hasCheckNumber, hasDate, hasPayee, hasAmount].filter(Boolean).length;
  const fieldConfidence = Number((fieldCount / 4).toFixed(2));
  const ocrConfidence = Number((Math.min(1, Math.max(0.5, args.cropText.trim().length / 1200))).toFixed(2));
  const imageQuality = 0.9;
  const crossValidation = args.crossValidationHit ? 0.9 : 0.55;
  const overall = Number(
    (
      imageQuality * 0.2 +
      ocrConfidence * 0.35 +
      fieldConfidence * 0.35 +
      crossValidation * 0.1
    ).toFixed(2)
  );

  return {
    imageQuality,
    ocrConfidence,
    fieldConfidence,
    crossValidation,
    overall
  };
};

export const extractCheckFieldsFromOcr = (args: {
  cropText: string;
  pageContext?: string;
  fallback?: Partial<StatementCheckExtracted>;
}) => {
  const cropLines = normalizeLines(args.cropText);
  const contextLines = normalizeLines(args.pageContext ?? '');

  const ocrCheckNumber = pickCheckNumber(cropLines) ?? pickCheckNumber(contextLines);
  const ocrDate = pickDate(cropLines) ?? pickDate(contextLines);
  const ocrPayeeName = pickPayee(cropLines, args.pageContext);
  const ocrAmount = pickAmount(cropLines) ?? pickAmount(contextLines);
  const ocrMemo = pickMemo(cropLines) ?? pickMemo(contextLines);

  const checkNumber = ocrCheckNumber ?? args.fallback?.checkNumber;
  const date = ocrDate ?? args.fallback?.date;
  const payeeName = ocrPayeeName ?? args.fallback?.payeeName;
  const amount = ocrAmount ?? args.fallback?.amount;
  const memo = ocrMemo ?? args.fallback?.memo;

  const extracted: StatementCheckExtracted = {
    checkNumber,
    date,
    payeeName,
    amount,
    memo,
    source: ocrCheckNumber || ocrDate || ocrPayeeName || typeof ocrAmount === 'number' || ocrMemo
      ? 'ocr'
      : args.fallback?.source ?? 'deterministic'
  };

  const reasons = [
    checkNumber ? 'Detected a check number from OCR text' : 'No check number in OCR text',
    date ? 'Detected a date from OCR text' : 'No date in OCR text',
    payeeName ? 'Detected payee evidence from OCR text' : 'No payee evidence in OCR text',
    typeof amount === 'number' ? 'Detected a currency amount from OCR text' : 'No amount in OCR text'
  ];

  return { extracted, reasons };
};

export const runStatementCheckExtraction = async (args: RunStatementCheckExtractionArgs): Promise<StatementCheckExtractionResult> => {
  if (args.persistArtifacts && (!args.bucketName || !args.rootPrefix)) {
    throw new Error('bucketName and rootPrefix are required when persistArtifacts is enabled');
  }

  const renderedCrop = args.persistArtifacts
    ? await renderAndPersistCheckCrop({
        pdfBuffer: args.pdfBuffer,
        pageNumber: args.pageNumber,
        cropBox: args.cropBox,
        checkKey: args.checkKey,
        bucketName: args.bucketName as string,
        rootPrefix: args.rootPrefix as string
      })
    : {
        crop: await renderCheckCropFromPdf({
          pdfBuffer: args.pdfBuffer,
          pageNumber: args.pageNumber,
          cropBox: args.cropBox
        }),
        objectPath: undefined,
        cropImagePath: undefined
      };

  const runOfflineOcr = async (): Promise<StatementCheckOcrObservation> => {
    const contextText =
      String(args.pageContext ?? '').trim().length > 0
        ? String(args.pageContext).trim()
        : String(args.internalPdfPageText ?? '').trim();
    const needsImageOcr = env.useTesseractFallback && (!args.fallback?.payeeName || !args.fallback?.memo);

    if (!needsImageOcr) {
      return {
        provider: 'pdf_text',
        text: contextText,
        blocks: [],
        paragraphs: [],
        words: [],
        raw: { source: 'statement_pdf_text', pageNumber: args.pageNumber }
      };
    }

    try {
      const tesseract = await import('tesseract.js');
      const createWorker = (tesseract as unknown as { createWorker?: (...args: unknown[]) => Promise<any> | any }).createWorker;
      if (typeof createWorker !== 'function') {
        throw new Error('tesseract.js createWorker is unavailable');
      }

      const worker = await Promise.resolve(createWorker('eng'));
      const result = await worker.recognize(renderedCrop.crop.buffer);
      await worker.terminate?.();
      const text = String(result?.data?.text ?? '').trim();

      return {
        provider: 'tesseract',
        text: text || contextText,
        blocks: [],
        paragraphs: [],
        words: [],
        raw: {
          source: 'tesseract',
          pageNumber: args.pageNumber,
          confidence: result?.data?.confidence ?? undefined
        }
      };
    } catch (error) {
      return {
        provider: 'pdf_text',
        text: contextText,
        blocks: [],
        paragraphs: [],
        words: [],
        raw: {
          source: 'tesseract_error',
          pageNumber: args.pageNumber,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  };

  const ocr = await runOfflineOcr();

  const { extracted: rawExtracted, reasons } = extractCheckFieldsFromOcr({
    cropText: ocr.text,
    pageContext: args.pageContext,
    fallback: args.fallback
  });
  const extracted: StatementCheckExtracted = {
    ...rawExtracted,
    checkNumber: args.fallback?.checkNumber ?? rawExtracted.checkNumber,
    date: args.fallback?.date ?? rawExtracted.date,
    amount: args.fallback?.amount ?? rawExtracted.amount,
    payeeName: rawExtracted.payeeName ?? args.fallback?.payeeName,
    memo: rawExtracted.memo ?? args.fallback?.memo,
    source:
      rawExtracted.payeeName || rawExtracted.memo
        ? (ocr.provider === 'pdf_text' ? 'pdf_text' : 'ocr')
        : args.fallback?.source ?? rawExtracted.source
  };

  const structured = {
    schemaVersion: 'v1',
    extracted,
    reasons,
    confidence: buildConfidence({
      extracted,
      cropText: ocr.text,
      crossValidationHit: Boolean(args.pageContext && extracted.payeeName && args.pageContext.includes(extracted.payeeName))
    })
  };

  const artifacts = {
    cropImagePath: renderedCrop.cropImagePath,
    ocrTextPath: args.bucketName && args.rootPrefix ? buildCheckOcrPath(args.rootPrefix, args.checkKey, 'ocr.txt') : undefined,
    ocrJsonPath: args.bucketName && args.rootPrefix ? buildCheckOcrPath(args.rootPrefix, args.checkKey, 'ocr.json') : undefined,
    structuredPath: args.bucketName && args.rootPrefix ? buildCheckStructuredPath(args.rootPrefix, args.checkKey) : undefined
  };

  if (args.bucketName && args.rootPrefix) {
    const storage = getStorageClient();
    const bucket = storage.bucket(args.bucketName);

    if (artifacts.ocrTextPath) {
      await bucket.file(artifacts.ocrTextPath).save(ocr.text, {
        contentType: 'text/plain',
        resumable: false,
        validation: false
      });
    }

    if (artifacts.ocrJsonPath) {
      await bucket.file(artifacts.ocrJsonPath).save(JSON.stringify({ ...ocr, extracted }, null, 2), {
        contentType: 'application/json',
        resumable: false,
        validation: false
      });
    }

    if (artifacts.structuredPath) {
      await bucket.file(artifacts.structuredPath).save(JSON.stringify(structured, null, 2), {
        contentType: 'application/json',
        resumable: false,
        validation: false
      });
    }
  }

  return {
    crop: renderedCrop.crop,
    ocr,
    extracted,
    confidence: structured.confidence,
    reasons: structured.reasons,
    artifacts
  };
};
