import { Test } from '@nestjs/testing';

import { AI_PROVIDER } from '../../../ai/ai-provider.port';
import { PdfProcessor } from './pdf.processor';

describe('PdfProcessor', () => {
  let processor: PdfProcessor;
  let aiProvider: { analyze: jest.Mock };

  const buildFile = (): Express.Multer.File =>
    ({
      buffer: Buffer.from('pdf-data'),
      mimetype: 'application/pdf',
    }) as Express.Multer.File;

  const buildContext = () => ({
    prompt: 'Extract data from PDF',
    responseSchema: { type: 'object' },
  });

  beforeEach(async () => {
    aiProvider = { analyze: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [PdfProcessor, { provide: AI_PROVIDER, useValue: aiProvider }],
    }).compile();

    processor = module.get(PdfProcessor);
  });

  it('chama AIProviderPort com fileBuffer, mimeType, prompt e responseSchema corretos', async () => {
    const file = buildFile();
    const context = buildContext();
    aiProvider.analyze.mockResolvedValue({ medicines: [] });

    await processor.extract(file, context);

    expect(aiProvider.analyze).toHaveBeenCalledWith({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  });

  it('retorna o resultado do AIProviderPort', async () => {
    const expected = { medicines: [{ name: 'Dipirona' }] };
    aiProvider.analyze.mockResolvedValue(expected);

    const result = await processor.extract(buildFile(), buildContext());

    expect(result).toEqual(expected);
  });
});
