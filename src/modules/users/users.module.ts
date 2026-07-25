import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { USERS_SERVICE } from './interfaces/users-service.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [
    // Registra a implementação sob o token da interface (injeção por contrato).
    {
      provide: USERS_SERVICE,
      useClass: UsersService,
    },
  ],
  exports: [USERS_SERVICE],
})
export class UsersModule {}
