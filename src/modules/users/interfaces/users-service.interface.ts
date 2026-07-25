import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../entities/user.entity';

/**
 * Contrato do UsersService. Services sempre implementam uma interface
 * para permitir mock nos testes e desacoplar consumidores da implementação.
 */
export const USERS_SERVICE = Symbol('USERS_SERVICE');

export interface IUsersService {
  findAll(): Promise<User[]>;
  findOne(id: string): Promise<User>;
  create(dto: CreateUserDto): Promise<User>;
  update(id: string, dto: UpdateUserDto): Promise<User>;
  remove(id: string): Promise<void>;
}
