import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

const INCOME_CATEGORIES = [
  '物业费收入',
  '电梯费收入',
  '停车费收入',
  '其他收入',
];
const EXPENSE_CATEGORIES = [
  '工资支出',
  '维修支出',
  '水电费支出',
  '保洁支出',
  '办公支出',
  '其他支出',
];

export class CreateFinanceDto {
  @ApiProperty({ enum: ['income', 'expense'], description: 'income 收入 / expense 支出' })
  @IsIn(['income', 'expense'])
  type: string;

  @ApiProperty({
    description: '分类：收入参考 ' + INCOME_CATEGORIES.join('/') + '；支出参考 ' + EXPENSE_CATEGORIES.join('/'),
  })
  @IsString()
  category: string;

  @ApiProperty({ example: 1000.5 })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  recordDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateFinanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  recordDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class FinanceQueryDto {
  @IsOptional()
  @IsIn(['income', 'expense'])
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number = 20;
}
