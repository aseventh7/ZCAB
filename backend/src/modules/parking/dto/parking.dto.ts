import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

const TYPE_LIST = ['ground', 'underground', 'mechanical'];
const STATUS_LIST = ['free', 'sold', 'rented', 'reserved'];

export class CreateParkingDto {
  @ApiProperty({ example: 'A-001' })
  @IsString()
  code: string;

  @ApiProperty({ enum: TYPE_LIST, default: 'underground' })
  @IsOptional()
  @IsIn(TYPE_LIST)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateParkingDto {
  @ApiPropertyOptional({ enum: TYPE_LIST })
  @IsOptional()
  @IsIn(TYPE_LIST)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

/** 绑定业主 */
export class BindOwnerDto {
  @ApiProperty({ description: '业主ID' })
  @Type(() => Number)
  @IsInt()
  ownerId: number;

  @ApiProperty({ enum: STATUS_LIST, description: 'sold 已售 / rented 已租 / reserved 预留' })
  @IsIn(['sold', 'rented', 'reserved'])
  status: string;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;
}

export class ParkingQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(TYPE_LIST)
  type?: string;

  @IsOptional()
  @IsIn(STATUS_LIST)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number = 20;
}
