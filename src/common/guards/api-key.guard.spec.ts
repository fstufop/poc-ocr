import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  const buildContext = (
    headers: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret-key') },
        },
      ],
    }).compile();

    guard = module.get(ApiKeyGuard);
  });

  it('lança UnauthorizedException quando o header X-Api-Key está ausente', () => {
    expect(() => guard.canActivate(buildContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('lança ForbiddenException quando a chave é inválida', () => {
    expect(() =>
      guard.canActivate(buildContext({ 'x-api-key': 'wrong-key' })),
    ).toThrow(ForbiddenException);
  });

  it('retorna true quando a chave é válida', () => {
    expect(guard.canActivate(buildContext({ 'x-api-key': 'secret-key' }))).toBe(
      true,
    );
  });
});
