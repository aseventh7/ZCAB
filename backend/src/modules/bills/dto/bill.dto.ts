import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const BILL_TYPES = ['property', 'elevator', 'parking'];
const STATUS_LIST = ['unpaid', 'partial', 'paid', 'overdue'];

/** 批量生成账单 */
export class GenerateBillsDto {
  @ApiProperty({ enum: BILL_TYPES, description: 'property 物业费 / elevator 电梯费 / parking 停车费' })
  @IsIn(BILL_TYPES)
  billType: string;

  @ApiProperty({ example: '2024-01', description: '计费周期，如 2024-01' })
  @IsString()
  period: string;

  @ApiProperty({ example: 2.5, description: '单价：物业费元/㎡/月，电梯费元/户/月，停车费元/月' })
  @Type(() => Number)
  @IsNumber()
  unitPrice: number;

  @ApiProperty({ default: 1, description: '计费月数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  months?: number;

  @ApiPropertyOptional({ description: '应缴截止日期，如 2024-02-15' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: '仅生成指定业主（传业主ID数组），不传则对所有业主生成' })
  @IsOptional()
  @IsArray()
  ownerIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

/** 单个账单缴费 */
export class PayBillDto {
  @ApiProperty({ example: 250.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

/** 批量缴费 */
export class BatchPayDto {
  @ApiProperty({ description: '账单ID数组', type: [Number] })
  @IsArray()
  billIds: number[];

  @ApiPropertyOptional({ description: '可选：覆盖每笔实缴金额（不填则按应缴金额全额缴清）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  paidAmount?: number;
}

export class BillQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(BILL_TYPES)
  billType?: string;

  @IsOptional()
  @IsIn(STATUS_LIST)
  status?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number = 20;
}

/** 批量打印催缴单 */
export class PrintNoticeDto {
  @ApiProperty({ description: '账单ID数组', type: [Number] })
  @IsArray()
  billIds: number[];
}
