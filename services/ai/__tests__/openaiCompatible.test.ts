/**
 * @fileoverview Tests del cliente OpenAI-compatible (fetch mock).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { completeVisionJson } from '../openaiCompatible';

vi.mock('../pdfToImages', () => ({
  prepareImageDataUrls: vi.fn(async (_b64: string, mime: string) => [
    `data:${mime};base64,abc`,
  ]),
}));

describe('openaiCompatible', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses assistant JSON content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ number: 'A-1', totalAmount: 10 }),
            },
          },
        ],
      }),
    });

    const data = await completeVisionJson<{ number: string; totalAmount: number }>(
      {
        providerId: 'groq',
        apiKey: 'test',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      },
      'prompt',
      'base64',
      'image/jpeg',
      2
    );

    expect(data.number).toBe('A-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries without response_format on 400 unsupported', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'response_format json_object not supported',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      });

    const data = await completeVisionJson<{ ok: boolean }>(
      {
        providerId: 'openrouter',
        apiKey: 'test',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'qwen/qwen2.5-vl-72b-instruct:free',
      },
      'prompt',
      'base64',
      'image/png',
      2
    );

    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps 429 to QUOTA/RATE_LIMIT error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'quota exceeded for model',
    });

    await expect(
      completeVisionJson(
        {
          providerId: 'groq',
          apiKey: 'test',
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          model: 'x',
        },
        'p',
        'b',
        'image/jpeg',
        1
      )
    ).rejects.toMatchObject({ code: 'QUOTA', providerId: 'groq' });
  });
});
