import { Test } from '@nestjs/testing';
import { AI_PROVIDER } from '../../../ai/ai-provider.port';
import { AudioProcessor } from './audio.processor';

describe('AudioProcessor', () => {
  let processor: AudioProcessor;
  let aiProvider: { analyze: jest.Mock };

  const buildFile = (): Express.Multer.File =>
    ({
      buffer: Buffer.from('audio-data'),
      mimetype: 'audio/mpeg',
    }) as Express.Multer.File;

  const buildContext = () => ({
    prompt: 'Extract medicines from audio',
    responseSchema: { type: 'object' },
  });

  const buildTokenUsage = () => ({
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  });

  beforeEach(async () => {
    aiProvider = { analyze: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AudioProcessor,
        { provide: AI_PROVIDER, useValue: aiProvider },
      ],
    }).compile();

    processor = module.get(AudioProcessor);
  });

  it('chama AIProviderPort com fileBuffer, mimeType, prompt e responseSchema corretos', async () => {
    const file = buildFile();
    const context = buildContext();
    aiProvider.analyze.mockResolvedValue({
      data: { medicines: [] },
      tokenUsage: buildTokenUsage(),
    });

    await processor.extract(file, context);

    expect(aiProvider.analyze).toHaveBeenCalledWith({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  });

  it('retorna { data, tokenUsage } do AIProviderPort', async () => {
    const expected = {
      data: { medicines: [{ name: 'Amoxicilina' }] },
      tokenUsage: buildTokenUsage(),
    };
    aiProvider.analyze.mockResolvedValue(expected);

    const result = await processor.extract(buildFile(), buildContext());

    expect(result).toEqual(expected);
  });
});
