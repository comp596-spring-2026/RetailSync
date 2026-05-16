import { env } from '../../config/env';
import { sleep, withRetries } from '../common/retry';

export type GeminiContentPart = {
  text: string;
};

export type GeminiGenerateContentArgs = {
  prompt: string;
  systemInstruction: string;
  model?: string;
  endpoint?: string;
  apiKey?: string;
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseJsonSchema?: unknown;
};

export type GeminiGenerateContentResult = {
  text: string;
  raw: unknown;
};

export class GeminiClientError extends Error {
  code: string;

  retryable: boolean;

  statusCode?: number;

  retryAfterMs?: number;

  constructor(
    code: string,
    message: string,
    options: {
      retryable?: boolean;
      statusCode?: number;
      retryAfterMs?: number;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'GeminiClientError';
    this.code = code;
    this.retryable = Boolean(options.retryable ?? false);
    this.statusCode = options.statusCode;
    this.retryAfterMs = options.retryAfterMs;
    if (options.cause instanceof Error && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      role?: string;
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const extractCandidateText = (candidate: NonNullable<GeminiResponse['candidates']>[number]) => {
  const parts = candidate.content?.parts ?? [];
  return parts
    .map((part) => String(part.text ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
};

export const buildGeminiEndpoint = (args: { endpoint?: string; model?: string; apiKey?: string }) => {
  const endpoint = (args.endpoint ?? env.statementGeminiEndpoint).trim().replace(/\/+$/, '');
  const model = (args.model ?? env.statementGeminiModel).trim();
  const apiKey = (args.apiKey ?? env.statementGeminiApiKey ?? '').trim();

  if (!endpoint) {
    throw new GeminiClientError('GEMINI_NOT_CONFIGURED', 'Gemini endpoint is not configured');
  }
  if (!model) {
    throw new GeminiClientError('GEMINI_NOT_CONFIGURED', 'Gemini model is not configured');
  }
  if (!apiKey) {
    throw new GeminiClientError('GEMINI_NOT_CONFIGURED', 'Gemini API key is not configured');
  }

  return `${endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
};

const parseRetryAfterMs = (value: string | null) => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30_000, seconds * 1000);
  }

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.min(30_000, Math.max(0, dateMs - Date.now()));
  }

  return undefined;
};

const retryDelayMs = (error: GeminiClientError, attempt: number) =>
  error.retryAfterMs ?? Math.min(5000, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 150);

const requestGeminiContentOnce = async (
  args: GeminiGenerateContentArgs
): Promise<GeminiGenerateContentResult> => {
  const timeoutMs = args.timeoutMs ?? env.statementGeminiTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new GeminiClientError('GEMINI_NOT_CONFIGURED', 'Gemini timeout must be a positive number');
  }

  const url = buildGeminiEndpoint(args);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: args.systemInstruction }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: args.prompt }]
          }
        ],
        generationConfig: {
          temperature: args.temperature ?? env.statementGeminiTemperature,
          maxOutputTokens: args.maxOutputTokens ?? env.statementGeminiMaxOutputTokens,
          responseMimeType: args.responseMimeType ?? 'application/json',
          ...(args.responseJsonSchema ? { responseJsonSchema: args.responseJsonSchema } : {})
        }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new GeminiClientError(
      'GEMINI_NETWORK_FAILED',
      `Gemini request could not be completed: ${error instanceof Error ? error.message : String(error)}`,
      {
        retryable: true,
        cause: error
      }
    );
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw new GeminiClientError(
      'GEMINI_REQUEST_FAILED',
      `Gemini request failed (${response.status}): ${bodyText.trim()}`,
      {
        retryable: response.status >= 500 || response.status === 429,
        statusCode: response.status,
        retryAfterMs: response.status === 429 ? parseRetryAfterMs(response.headers.get('retry-after')) : undefined
      }
    );
  }

  let raw: GeminiResponse;
  try {
    raw = JSON.parse(bodyText) as GeminiResponse;
  } catch (error) {
    throw new GeminiClientError('GEMINI_BAD_RESPONSE', 'Gemini response was not valid JSON', {
      retryable: true,
      cause: error
    });
  }

  const first = raw.candidates?.[0];
  if (!first) {
    throw new GeminiClientError('GEMINI_EMPTY_RESPONSE', 'Gemini returned no candidates', {
      retryable: true
    });
  }

  if (raw.promptFeedback?.blockReason) {
    throw new GeminiClientError(
      'GEMINI_BLOCKED',
      `Gemini response was blocked: ${raw.promptFeedback.blockReason}`,
      {
        retryable: false
      }
    );
  }

  if (first.finishReason && !['STOP', 'MAX_TOKENS'].includes(first.finishReason)) {
    throw new GeminiClientError(
      'GEMINI_INCOMPLETE',
      `Gemini response finished with ${first.finishReason}`,
      {
        retryable: true
      }
    );
  }

  const text = extractCandidateText(first);
  if (!text) {
    throw new GeminiClientError('GEMINI_EMPTY_RESPONSE', 'Gemini candidate did not contain any text', {
      retryable: true
    });
  }

  return {
    text,
    raw
  };
};

export const generateGeminiContent = async (args: GeminiGenerateContentArgs): Promise<GeminiGenerateContentResult> =>
  withRetries({
    attempts: 3,
    shouldRetry: (error, attempt) =>
      attempt < 3 && error instanceof GeminiClientError && error.retryable,
    onRetry: async (error, attempt) => {
      const clientError = error as GeminiClientError;
      await sleep(retryDelayMs(clientError, attempt));
    },
    run: () => requestGeminiContentOnce(args)
  });
