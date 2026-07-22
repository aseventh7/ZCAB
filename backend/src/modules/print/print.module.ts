import { Module } from '@nestjs/common';
import { PrintService } from './print.service';
import { PrintController } from './print.controller';
import { BillsModule } from '../bills/bills.module';

@Module({
  imports: [BillsModule],
  providers: [PrintService],
  controllers: [PrintController],
})
export class PrintModule {}
