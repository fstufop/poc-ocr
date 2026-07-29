import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MedicinesAnalysisDto } from './dto/medicines-analysis.dto';
import { VaccinesAnalysisDto } from './dto/vaccines-analysis.dto';
import {
  ANALYZE_SERVICE,
  IAnalyzeService,
} from './interfaces/analyze-service.interface';

@ApiTags('analyze')
@ApiSecurity('x-api-key')
@Controller('analyze')
@UseGuards(ApiKeyGuard)
export class AnalyzeController {
  constructor(
    @Inject(ANALYZE_SERVICE)
    private readonly analyzeService: IAnalyzeService,
  ) {}

  @Post('medicines')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: MedicinesAnalysisDto })
  analyzeMedicines(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<MedicinesAnalysisDto> {
    return this.analyzeService.analyzeMedicines(file);
  }

  @Post('vaccines')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: VaccinesAnalysisDto })
  analyzeVaccines(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<VaccinesAnalysisDto> {
    return this.analyzeService.analyzeVaccines(file);
  }
}
