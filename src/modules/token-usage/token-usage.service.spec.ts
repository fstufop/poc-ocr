import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TokenUsageRecord } from './entities/token-usage-record.entity';
import { TokenUsageService } from './token-usage.service';
import { RecordTokenUsageDto } from './dto/record-token-usage.dto';

describe('TokenUsageService', () => {
  let service: TokenUsageService;
  let repo: { create: jest.Mock; save: jest.Mock; query: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn(
        (dto: RecordTokenUsageDto): Partial<TokenUsageRecord> => ({ ...dto }),
      ),
      save: jest.fn().mockResolvedValue({}),
      query: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TokenUsageService,
        { provide: getRepositoryToken(TokenUsageRecord), useValue: repo },
      ],
    }).compile();

    service = module.get(TokenUsageService);
  });

  describe('record', () => {
    it('cria e salva um TokenUsageRecord no repositório', async () => {
      const dto: RecordTokenUsageDto = {
        endpoint: 'analyze/medicines',
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      };

      await service.record(dto);

      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('aggregate', () => {
    it('retorna estrutura com totals, byEndpoint e byDay', async () => {
      const totalsRow = {
        requestCount: 2,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      };
      const endpointRow = {
        endpoint: 'analyze/medicines',
        requestCount: 2,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      };
      const dayRow = {
        date: '2026-07-28',
        requestCount: 2,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      };

      repo.query
        .mockResolvedValueOnce([totalsRow])
        .mockResolvedValueOnce([endpointRow])
        .mockResolvedValueOnce([dayRow]);

      const result = await service.aggregate({
        from: '2026-07-01',
        to: '2026-07-28',
      });

      expect(result.from).toBe('2026-07-01');
      expect(result.to).toBe('2026-07-28');
      expect(result.totals).toEqual(totalsRow);
      expect(result.byEndpoint).toEqual([endpointRow]);
      expect(result.byDay).toEqual([dayRow]);
    });

    it('filtra por endpoint quando fornecido', async () => {
      repo.query.mockResolvedValue([]);

      await service.aggregate({ endpoint: 'analyze/vaccines' });

      // Verifica que o SQL inclui a condição de endpoint
      expect(repo.query).toHaveBeenCalledWith(
        expect.stringContaining('AND endpoint = $3'),
        expect.arrayContaining(['analyze/vaccines']),
      );
    });

    it('retorna totals zerados quando não há registros', async () => {
      repo.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.aggregate({});

      expect(result.totals).toEqual({
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });
  });
});
