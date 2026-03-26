import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../config/env', () => ({
  env: {
    statementGeminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    statementGeminiModel: 'gemini-2.5-flash',
    statementGeminiApiKey: 'test-api-key',
    statementGeminiTimeoutMs: 120000,
    statementGeminiTemperature: 0.2,
    statementGeminiMaxOutputTokens: 1024
  }
}));

describe('gemini.client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('parses a JSON response from Gemini', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"qbTxnType":"Check","confidence":0.84,"reasons":["vendor matched"]}' }]
              },
              finishReason: 'STOP'
            }
          ]
        })
    });

    const { generateGeminiContent } = await import('./gemini.client');
    const result = await generateGeminiContent({
      prompt: 'Return JSON only',
      systemInstruction: 'Be precise'
    });

    expect(result.text).toContain('"qbTxnType":"Check"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces retryable failures for transient Gemini errors', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'temporarily unavailable'
    });

    const { generateGeminiContent, GeminiClientError } = await import('./gemini.client');

    await expect(
      generateGeminiContent({
        prompt: 'Return JSON only',
        systemInstruction: 'Be precise'
      })
    ).rejects.toMatchObject({
      name: 'GeminiClientError',
      code: 'GEMINI_REQUEST_FAILED',
      retryable: true
    });

    expect(GeminiClientError).toBeDefined();
  });
});
