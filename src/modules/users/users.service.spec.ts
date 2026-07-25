import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const buildUser = (overrides: Partial<User> = {}): User => ({
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('retorna do cache quando há hit, sem consultar o banco', async () => {
      const user = buildUser();
      cache.get.mockResolvedValue(user);

      const result = await service.findOne(user.id);

      expect(result).toEqual(user);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('consulta o banco e popula o cache no miss', async () => {
      const user = buildUser();
      cache.get.mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue(user);

      const result = await service.findOne(user.id);

      expect(result).toEqual(user);
      expect(cache.set).toHaveBeenCalledWith(`users:${user.id}`, user);
    });

    it('lança NotFoundException quando não existe', async () => {
      cache.get.mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('cria um usuário novo', async () => {
      const dto = { name: 'Ada Lovelace', email: 'ada@example.com' };
      const user = buildUser();
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(user);
      repo.save.mockResolvedValue(user);

      const result = await service.create(dto);

      expect(result).toEqual(user);
      expect(repo.save).toHaveBeenCalledWith(user);
    });

    it('lança ConflictException com email duplicado', async () => {
      repo.findOne.mockResolvedValue(buildUser());

      await expect(
        service.create({ name: 'X', email: 'ada@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('atualiza e invalida o cache', async () => {
      const user = buildUser();
      repo.findOne.mockResolvedValue(user);
      repo.save.mockResolvedValue({ ...user, name: 'Grace Hopper' });

      const result = await service.update(user.id, { name: 'Grace Hopper' });

      expect(result.name).toBe('Grace Hopper');
      expect(cache.del).toHaveBeenCalledWith(`users:${user.id}`);
    });
  });

  describe('remove', () => {
    it('lança NotFoundException quando nada é afetado', async () => {
      repo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('remove e invalida o cache', async () => {
      repo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await service.remove('id');

      expect(cache.del).toHaveBeenCalledWith('users:id');
    });
  });
});
