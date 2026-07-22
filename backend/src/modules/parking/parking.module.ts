import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Parking } from './parking.entity';
import { Owner } from '../owners/owner.entity';
import { ParkingService } from './parking.service';
import { ParkingController } from './parking.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Parking, Owner])],
  providers: [ParkingService],
  controllers: [ParkingController],
  exports: [ParkingService],
})
export class ParkingModule {}
