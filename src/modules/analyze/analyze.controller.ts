import {
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MedicinesAnalysisDto } from './dto/medicines-analysis.dto';
import { VaccinesAnalysisDto } from './dto/vaccines-analysis.dto';
import {
  ANALYZE_SERVICE,
  IAnalyzeService,
} from './interfaces/analyze-service.interface';

@Controller('analyze')
@UseGuards(ApiKeyGuard)
export class AnalyzeController {
  constructor(
    @Inject(ANALYZE_SERVICE)
    private readonly analyzeService: IAnalyzeService,
  ) {}

  @Post('medicines')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  analyzeMedicines(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<MedicinesAnalysisDto> {
    return this.analyzeService.analyzeMedicines(file);
  }

  @Post('vaccines')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  analyzeVaccines(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<VaccinesAnalysisDto> {
    return this.analyzeService.analyzeVaccines(file);
  }
}
