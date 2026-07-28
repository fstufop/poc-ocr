import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MedicinesContext } from './contexts/medicines.context';
import { VaccinesContext } from './contexts/vaccines.context';
import { MedicinesAnalysisDto } from './dto/medicines-analysis.dto';
import { VaccinesAnalysisDto } from './dto/vaccines-analysis.dto';
import { IAnalyzeService } from './interfaces/analyze-service.interface';
import { IProcessor } from './interfaces/processor.interface';
import { AudioProcessor } from './processors/audio.processor';
import { ImageProcessor } from './processors/image.processor';
import { PdfProcessor } from './processors/pdf.processor';
import { TokenUsageService } from '../token-usage/token-usage.service';

type MediaType = 'audio' | 'image' | 'pdf';

const MIME_TYPE_MAP: Record<string, MediaType> = {
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/mp4': 'audio',
  'audio/ogg': 'audio',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'application/pdf': 'pdf',
};

const MAX_SIZE_ENV_KEY: Record<MediaType, string> = {
  audio: 'AUDIO_MAX_SIZE_MB',
  image: 'IMAGE_MAX_SIZE_MB',
  pdf: 'PDF_MAX_SIZE_MB',
};

const DEFAULT_MAX_MB: Record<MediaType, number> = {
  audio: 25,
  image: 10,
  pdf: 20,
};

@Injectable()
export class AnalyzeService implements IAnalyzeService {
  private readonly logger = new Logger(AnalyzeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audioProcessor: AudioProcessor,
    private readonly imageProcessor: ImageProcessor,
    private readonly pdfProcessor: PdfProcessor,
    private readonly tokenUsageService: TokenUsageService,
  ) {}

  private resolveProcessor(mimeType: string): IProcessor {
    const type = MIME_TYPE_MAP[mimeType];
    if (!type) {
      throw new UnprocessableEntityException(
        `Unsupported file type: ${mimeType}`,
      );
    }
    const map: Record<MediaType, IProcessor> = {
      audio: this.audioProcessor,
      image: this.imageProcessor,
      pdf: this.pdfProcessor,
    };
    return map[type];
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) throw new BadRequestException('File is required');

    const type = MIME_TYPE_MAP[file.mimetype];
    if (!type) {
      throw new UnprocessableEntityException(
        `Unsupported file type: ${file.mimetype}`,
      );
    }

    const maxMB = this.config.get<number>(
      MAX_SIZE_ENV_KEY[type],
      DEFAULT_MAX_MB[type],
    );
    if (file.size > maxMB * 1024 * 1024) {
      throw new HttpException(
        `File too large. Max: ${maxMB}MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }

  private recordUsage(
    endpoint: string,
    tokenUsage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    },
  ): void {
    this.tokenUsageService
      .record({
        endpoint,
        provider: 'gemini',
        model: this.config.get<string>('GEMINI_MODEL', 'gemini-1.5-flash'),
        ...tokenUsage,
      })
      .catch((err) => this.logger.error('Failed to record token usage', err));
  }

  async analyzeMedicines(
    file: Express.Multer.File,
  ): Promise<MedicinesAnalysisDto> {
    this.validateFile(file);
    const processor = this.resolveProcessor(file.mimetype);
    this.logger.log(`Analyzing medicines — mimeType: ${file.mimetype}`);
    const { data, tokenUsage } = await processor.extract<MedicinesAnalysisDto>(
      file,
      MedicinesContext,
    );
    this.recordUsage('analyze/medicines', tokenUsage);
    return data;
  }

  async analyzeVaccines(
    file: Express.Multer.File,
  ): Promise<VaccinesAnalysisDto> {
    this.validateFile(file);
    const processor = this.resolveProcessor(file.mimetype);
    this.logger.log(`Analyzing vaccines — mimeType: ${file.mimetype}`);
    const { data, tokenUsage } = await processor.extract<VaccinesAnalysisDto>(
      file,
      VaccinesContext,
    );
    this.recordUsage('analyze/vaccines', tokenUsage);
    return data;
  }
}
