import {
  BadRequestException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MedicinesContext } from './contexts/medicines.context';
import { VaccinesContext } from './contexts/vaccines.context';
import { AnalyzeService } from './analyze.service';
import { AudioProcessor } from './processors/audio.processor';
import { ImageProcessor } from './processors/image.processor';
import { PdfProcessor } from './processors/pdf.processor';

describe('AnalyzeService', () => {
  let service: AnalyzeService;
  let audioProcessor: { extract: jest.Mock };
  let imageProcessor: { extract: jest.Mock };
  let pdfProcessor: { extract: jest.Mock };

  const buildFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('data'),
      ...overrides,
    }) as Express.Multer.File;

  beforeEach(async () => {
    audioProcessor = { extract: jest.fn() };
    imageProcessor = { extract: jest.fn() };
    pdfProcessor = { extract: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AnalyzeService,
        { provide: AudioProcessor, useValue: audioProcessor },
        { provide: ImageProcessor, useValue: imageProcessor },
        { provide: PdfProcessor, useValue: pdfProcessor },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def: number) => {
              const map: Record<string, number> = {
                AUDIO_MAX_SIZE_MB: 25,
                IMAGE_MAX_SIZE_MB: 10,
                PDF_MAX_SIZE_MB: 20,
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AnalyzeService);
  });

  describe('analyzeMedicines', () => {
    it('roteia image/jpeg para ImageProcessor com MedicinesContext', async () => {
      const file = buildFile({ mimetype: 'image/jpeg' });
      const expected = {
        medicines: [{ name: 'Amoxicilina', dosage: '500mg', frequency: '8h' }],
      };
      imageProcessor.extract.mockResolvedValue(expected);

      const result = await service.analyzeMedicines(file);

      expect(imageProcessor.extract).toHaveBeenCalledWith(
        file,
        MedicinesContext,
      );
      expect(result).toEqual(expected);
    });

    it('roteia audio/mpeg para AudioProcessor', async () => {
      const file = buildFile({ mimetype: 'audio/mpeg' });
      audioProcessor.extract.mockResolvedValue({ medicines: [] });

      await service.analyzeMedicines(file);

      expect(audioProcessor.extract).toHaveBeenCalledWith(
        file,
        MedicinesContext,
      );
    });

    it('roteia application/pdf para PdfProcessor', async () => {
      const file = buildFile({ mimetype: 'application/pdf' });
      pdfProcessor.extract.mockResolvedValue({ medicines: [] });

      await service.analyzeMedicines(file);

      expect(pdfProcessor.extract).toHaveBeenCalledWith(file, MedicinesContext);
    });

    it('lança BadRequestException quando file é undefined', async () => {
      await expect(
        service.analyzeMedicines(undefined as unknown as Express.Multer.File),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança UnprocessableEntityException para MIME type não suportado', async () => {
      const file = buildFile({ mimetype: 'text/plain' });

      await expect(service.analyzeMedicines(file)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('lança HttpException 413 quando arquivo excede o limite configurado', async () => {
      const file = buildFile({
        mimetype: 'image/jpeg',
        size: 11 * 1024 * 1024, // 11 MB > limit of 10 MB
      });

      await expect(service.analyzeMedicines(file)).rejects.toMatchObject({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    });
  });

  describe('analyzeVaccines', () => {
    it('roteia image/png para ImageProcessor com VaccinesContext', async () => {
      const file = buildFile({ mimetype: 'image/png' });
      const expected = {
        vaccines: [{ name: 'BCG', date: '2020-01-01', dose: 'única' }],
      };
      imageProcessor.extract.mockResolvedValue(expected);

      const result = await service.analyzeVaccines(file);

      expect(imageProcessor.extract).toHaveBeenCalledWith(
        file,
        VaccinesContext,
      );
      expect(result).toEqual(expected);
    });
  });
});
