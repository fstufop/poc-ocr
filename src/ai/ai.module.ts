import { Module } from '@nestjs/common';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { AI_PROVIDER } from './ai-provider.port';

@Module({
  providers: [{ provide: AI_PROVIDER, useClass: GeminiAdapter }],
  exports: [AI_PROVIDER],
})
export class AiModule {}
