import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../modules/users/user.entity';
import { Building } from '../modules/buildings/building.entity';
import { Room } from '../modules/rooms/room.entity';
import { Parking } from '../modules/parking/parking.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Building, Room, Parking])],
  providers: [SeedService],
})
export class DatabaseModule {}
