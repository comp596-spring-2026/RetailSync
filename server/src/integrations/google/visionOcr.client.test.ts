import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAccessTokenMock = vi.fn();
const googleAuthConstructor = vi.fn(() => ({
  getClient: vi.fn(async () => ({
    getAccessToken: getAccessTokenMock
  }))
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: googleAuthConstructor
    }
  }
}));

vi.mock('../../config/env', () => ({
  env: {
    statementOcrVisionEndpoint: 'https://vision.example/v1/images:annotate',
    statementOcrTimeoutMs: 1500
  }
}));

vi.mock('./serviceAccountCredentials', () => ({
  resolveServiceAccountCredentials: vi.fn(() => null)
}));

describe('visionOcr.client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('parses a successful Vision OCR response into text and page units', async () => {
    getAccessTokenMock.mockResolvedValue({ token: 'token-123' });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Check 1001\nPay to the Order of Acme Plumbing\n03/25/2026\n$125.00',
                pages: [
                  {
                    blocks: [
                      {
                        text: 'Check 1001',
                        confidence: 0.98,
                        boundingBox: {
                          vertices: [
                            { x: 10, y: 20 },
                            { x: 110, y: 20 },
                            { x: 110, y: 60 },
                            { x: 10, y: 60 }
                          ]
                        },
                        paragraphs: [
                          {
                            text: 'Check 1001',
                            confidence: 0.97,
                            boundingBox: {
                              vertices: [
                                { x: 10, y: 20 },
                                { x: 110, y: 20 },
                                { x: 110, y: 60 },
                                { x: 10, y: 60 }
                              ]
                            },
                            words: [
                              {
                                text: 'Check 1001',
                                confidence: 0.96,
                                boundingBox: {
                                  vertices: [
                                    { x: 10, y: 20 },
                                    { x: 110, y: 20 },
                                    { x: 110, y: 60 },
                                    { x: 10, y: 60 }
                                  ]
                                }
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );

    const { ocrImageWithVision } = await import('./visionOcr.client');
    const result = await ocrImageWithVision({
      imageBuffer: Buffer.from('image-bytes')
    });

    expect(result.provider).toBe('vision');
    expect(result.text).toContain('Acme Plumbing');
    expect(result.blocks).toHaveLength(1);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.words).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://vision.example/v1/images:annotate');
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer token-123'
    });
  });

  it('surfaces retryable failures when Vision returns a transient error', async () => {
    getAccessTokenMock.mockResolvedValue({ token: 'token-123' });
    fetchMock.mockResolvedValue(
      new Response('rate limited', {
        status: 429,
        headers: { 'content-type': 'text/plain' }
      })
    );

    const { ocrImageWithVision } = await import('./visionOcr.client');

    await expect(
      ocrImageWithVision({
        imageBuffer: Buffer.from('image-bytes')
      })
    ).rejects.toMatchObject({
      name: 'VisionOcrError',
      code: 'VISION_REQUEST_FAILED',
      retryable: true,
      statusCode: 429
    });
  });
});
