import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { TokenUsageModule } from '../token-usage/token-usage.module';
import { AnalyzeController } from './analyze.controller';
import { AnalyzeService } from './analyze.service';
import { ANALYZE_SERVICE } from './interfaces/analyze-service.interface';
import { AudioProcessor } from './processors/audio.processor';
import { ImageProcessor } from './processors/image.processor';
import { PdfProcessor } from './processors/pdf.processor';

@Module({
  imports: [AiModule, TokenUsageModule],
  controllers: [AnalyzeController],
  providers: [
    { provide: ANALYZE_SERVICE, useClass: AnalyzeService },
    AudioProcessor,
    ImageProcessor,
    PdfProcessor,
    ApiKeyGuard,
  ],
})
export class AnalyzeModule {}
