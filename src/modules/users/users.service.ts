import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { IUsersService } from './interfaces/users-service.interface';

@Injectable()
export class UsersService implements IUsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  /** Convenção de chave de cache por recurso: `users:{id}`. */
  private cacheKey(id: string): string {
    return `users:${id}`;
  }

  async findAll(): Promise<User[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<User> {
    const cached = await this.cache.get<User>(this.cacheKey(id));
    if (cached) {
      this.logger.debug(`Cache hit para user ${id}`);
      return cached;
    }

    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuário ${id} não encontrado`);
    }

    await this.cache.set(this.cacheKey(id), user);
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const exists = await this.repo.findOne({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException(`Email ${dto.email} já cadastrado`);
    }

    const user = this.repo.create(dto);
    return this.repo.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuário ${id} não encontrado`);
    }

    Object.assign(user, dto);
    const saved = await this.repo.save(user);

    // Invalida o cache após a escrita.
    await this.cache.del(this.cacheKey(id));
    return saved;
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Usuário ${id} não encontrado`);
    }
    await this.cache.del(this.cacheKey(id));
  }
}
