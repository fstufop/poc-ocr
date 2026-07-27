import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GoogleGenAI } from '@google/genai';
import { GeminiAdapter } from './gemini.adapter';

jest.mock('@google/genai');

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter;
  let mockGenerateContent: jest.Mock;

  const buildInput = () => ({
    fileBuffer: Buffer.from('fake-content'),
    mimeType: 'image/jpeg',
    prompt: 'Extract data',
    responseSchema: {
      type: 'object',
      properties: { result: { type: 'string' } },
    },
  });

  beforeEach(async () => {
    mockGenerateContent = jest.fn();
    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    }));

    const module = await Test.createTestingModule({
      providers: [
        GeminiAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                GEMINI_API_KEY: 'test-key',
                GEMINI_MODEL: 'gemini-1.5-flash',
                AI_TIMEOUT_MS: 50, // short timeout for test
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get(GeminiAdapter);
  });

  it('retorna o JSON parseado da resposta do Gemini', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"result":"ok"}' });

    const result = await adapter.analyze<{ result: string }>(buildInput());

    expect(result).toEqual({ result: 'ok' });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-1.5-flash' }),
    );
  });

  it('lança BadGatewayException quando a resposta está vazia', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' });

    await expect(adapter.analyze(buildInput())).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('lança GatewayTimeoutException quando excede AI_TIMEOUT_MS', async () => {
    mockGenerateContent.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ text: '{}' }), 200),
        ),
    );

    await expect(adapter.analyze(buildInput())).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  }, 5000);
});
