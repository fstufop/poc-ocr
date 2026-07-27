import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER, AIProviderPort } from '../../../ai/ai-provider.port';
import { AnalysisContext, IProcessor } from '../interfaces/processor.interface';

@Injectable()
export class PdfProcessor implements IProcessor {
  constructor(
    @Inject(AI_PROVIDER)
    private readonly aiProvider: AIProviderPort,
  ) {}

  extract<T>(file: Express.Multer.File, context: AnalysisContext): Promise<T> {
    return this.aiProvider.analyze<T>({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  }
}
