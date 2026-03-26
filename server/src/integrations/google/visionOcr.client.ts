import { google } from 'googleapis';
import { env } from '../../config/env';
import { resolveServiceAccountCredentials } from './serviceAccountCredentials';

const VISION_SCOPE = ['https://www.googleapis.com/auth/cloud-platform'];

export type OcrBoundingBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type OcrTextUnit = {
  text: string;
  bbox: OcrBoundingBox;
  confidence?: number;
};

export type OcrPageObservation = {
  provider: 'vision';
  text: string;
  blocks: OcrTextUnit[];
  paragraphs: OcrTextUnit[];
  words: OcrTextUnit[];
  raw: unknown;
};

export class VisionOcrError extends Error {
  code: string;

  retryable: boolean;

  statusCode?: number;

  constructor(
    code: string,
    message: string,
    options: {
      retryable?: boolean;
      statusCode?: number;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'VisionOcrError';
    this.code = code;
    this.retryable = Boolean(options.retryable ?? false);
    this.statusCode = options.statusCode;
    if (options.cause instanceof Error && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

export type OcrImageArgs = {
  imageBuffer: Buffer;
  mimeType?: string;
  endpoint?: string;
  timeoutMs?: number;
};

type VisionVertex = { x?: number; y?: number };

type VisionBoundingPoly = {
  normalizedVertices?: VisionVertex[];
  vertices?: VisionVertex[];
};

type VisionTextUnit = {
  text?: string;
  confidence?: number;
  boundingBox?: VisionBoundingPoly;
  words?: VisionTextUnit[];
  symbols?: VisionTextUnit[];
  paragraphs?: VisionTextUnit[];
  blocks?: VisionTextUnit[];
  pages?: VisionTextUnit[];
};

type VisionResponse = {
  responses?: Array<{
    error?: { message?: string };
    fullTextAnnotation?: VisionTextUnit & { text?: string };
    textAnnotations?: Array<{ description?: string; boundingPoly?: VisionBoundingPoly }>;
  }>;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
};

const clampCoordinate = (value: number) => Math.max(0, Math.round(value));

const verticesToBBox = (poly?: VisionBoundingPoly): OcrBoundingBox | null => {
  const vertices = poly?.normalizedVertices ?? poly?.vertices;
  if (!Array.isArray(vertices) || vertices.length === 0) {
    return null;
  }

  const xs = vertices
    .map((vertex) => toNumber(vertex?.x))
    .filter((value): value is number => value != null);
  const ys = vertices
    .map((vertex) => toNumber(vertex?.y))
    .filter((value): value is number => value != null);

  if (xs.length === 0 || ys.length === 0) {
    return null;
  }

  return {
    left: clampCoordinate(Math.min(...xs)),
    top: clampCoordinate(Math.min(...ys)),
    right: clampCoordinate(Math.max(...xs)),
    bottom: clampCoordinate(Math.max(...ys))
  };
};

const collectText = (unit?: VisionTextUnit): string => {
  if (!unit) return '';
  const text = String(unit.text ?? '').trim();
  if (text) return text;
  const fromWords = Array.isArray(unit.words) ? unit.words.map(collectText).filter(Boolean).join(' ') : '';
  if (fromWords) return fromWords;
  const fromParagraphs = Array.isArray(unit.paragraphs)
    ? unit.paragraphs.map(collectText).filter(Boolean).join(' ')
    : '';
  if (fromParagraphs) return fromParagraphs;
  const fromBlocks = Array.isArray(unit.blocks) ? unit.blocks.map(collectText).filter(Boolean).join(' ') : '';
  if (fromBlocks) return fromBlocks;
  return '';
};

const toTextUnit = (unit?: VisionTextUnit): OcrTextUnit | null => {
  if (!unit) return null;
  const text = collectText(unit).trim();
  const bbox = verticesToBBox(unit.boundingBox);
  if (!text || !bbox) return null;
  return {
    text,
    bbox,
    confidence: toNumber(unit.confidence) ?? undefined
  };
};

const buildObservation = (response: NonNullable<VisionResponse['responses']>[number]): OcrPageObservation => {
  const fullText = String(response.fullTextAnnotation?.text ?? '').trim();
  const full = response.fullTextAnnotation ?? {};
  const pages = Array.isArray(full.pages) ? full.pages : [];

  const blocks: OcrTextUnit[] = [];
  const paragraphs: OcrTextUnit[] = [];
  const words: OcrTextUnit[] = [];

  for (const page of pages) {
    if (!page || typeof page !== 'object') continue;
    if (Array.isArray(page.blocks)) {
      for (const block of page.blocks) {
        const next = toTextUnit(block);
        if (next) blocks.push(next);
        if (Array.isArray(block?.paragraphs)) {
          for (const paragraph of block.paragraphs) {
            const paragraphUnit = toTextUnit(paragraph);
            if (paragraphUnit) paragraphs.push(paragraphUnit);
            if (Array.isArray(paragraph?.words)) {
              for (const word of paragraph.words) {
                const wordUnit = toTextUnit(word);
                if (wordUnit) words.push(wordUnit);
              }
            }
          }
        }
      }
    }
  }

  if (words.length === 0 && Array.isArray(response.textAnnotations) && response.textAnnotations.length > 1) {
    for (const annotation of response.textAnnotations.slice(1)) {
      const unit = toTextUnit({
        text: annotation?.description,
        boundingBox: annotation?.boundingPoly
      });
      if (unit) words.push(unit);
    }
  }

  if (!fullText) {
    const fallback = response.textAnnotations?.[0]?.description;
    if (typeof fallback === 'string' && fallback.trim()) {
      return {
        provider: 'vision',
        text: fallback.trim(),
        blocks,
        paragraphs,
        words,
        raw: response
      };
    }
  }

  return {
    provider: 'vision',
    text: fullText || String(response.textAnnotations?.[0]?.description ?? '').trim(),
    blocks,
    paragraphs,
    words,
    raw: response
  };
};

const getAccessToken = async () => {
  const credentials = resolveServiceAccountCredentials();
  const auth = credentials
    ? new google.auth.GoogleAuth({ scopes: VISION_SCOPE, credentials })
    : new google.auth.GoogleAuth({ scopes: VISION_SCOPE });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token ?? null;
  if (!accessToken) {
    throw new VisionOcrError('VISION_AUTH_FAILED', 'Failed to acquire access token for Vision API', {
      retryable: true
    });
  }
  return accessToken;
};

export const ocrImageWithVision = async (args: OcrImageArgs): Promise<OcrPageObservation> => {
  const endpoint = args.endpoint ?? env.statementOcrVisionEndpoint;
  const timeoutMs = args.timeoutMs ?? env.statementOcrTimeoutMs;
  const mimeType = args.mimeType ?? 'image/png';

  if (!endpoint || !endpoint.trim()) {
    throw new VisionOcrError('VISION_NOT_CONFIGURED', 'Vision OCR endpoint is not configured');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new VisionOcrError('VISION_NOT_CONFIGURED', 'Vision OCR timeout must be a positive number');
  }

  const accessToken = await getAccessToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: args.imageBuffer.toString('base64') },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: {
            languageHints: ['en']
          }
        }
      ]
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new VisionOcrError(
      'VISION_REQUEST_FAILED',
      `Vision OCR request failed (${response.status}): ${bodyText.trim()}`,
      {
        retryable: response.status >= 500 || response.status === 429,
        statusCode: response.status
      }
    );
  }

  let body: VisionResponse;
  try {
    body = JSON.parse(bodyText) as VisionResponse;
  } catch (error) {
    throw new VisionOcrError('VISION_BAD_RESPONSE', 'Vision OCR response was not valid JSON', {
      retryable: true,
      cause: error
    });
  }

  const first = body.responses?.[0];
  if (!first) {
    throw new VisionOcrError('VISION_EMPTY_RESPONSE', 'Vision OCR returned no responses', {
      retryable: true
    });
  }
  if (first.error?.message) {
    throw new VisionOcrError('VISION_RESPONSE_ERROR', first.error.message, {
      retryable: false
    });
  }

  return buildObservation(first);
};

export const parseVisionObservation = (response: unknown): OcrPageObservation => {
  const first = (response as VisionResponse | undefined)?.responses?.[0];
  if (!first) {
    throw new VisionOcrError('VISION_EMPTY_RESPONSE', 'Vision OCR returned no responses', {
      retryable: true
    });
  }
  return buildObservation(first);
};
