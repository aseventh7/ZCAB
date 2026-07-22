import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Owner } from './owner.entity';
import { Room } from '../rooms/room.entity';
import { OwnersService } from './owners.service';
import { OwnersController } from './owners.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Owner, Room])],
  providers: [OwnersService],
  controllers: [OwnersController],
  exports: [OwnersService],
})
export class OwnersModule {}
