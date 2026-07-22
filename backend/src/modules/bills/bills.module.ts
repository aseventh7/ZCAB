import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bill } from './bill.entity';
import { Owner } from '../owners/owner.entity';
import { Parking } from '../parking/parking.entity';
import { FinanceRecord } from '../finance/finance.entity';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Bill, Owner, Parking, FinanceRecord])],
  providers: [BillsService],
  controllers: [BillsController],
  exports: [BillsService],
})
export class BillsModule {}
