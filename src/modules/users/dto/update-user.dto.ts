import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

/**
 * Todos os campos de CreateUserDto tornam-se opcionais, mantendo as
 * validações de class-validator quando presentes.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
