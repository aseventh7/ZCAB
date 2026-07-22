import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const STATUS_LIST = ['self_occupied', 'rented', 'vacant', 'decorating'];

export class CreateOwnerDto {
  @ApiProperty({ example: '张三' })
  @IsString()
  name: string;

  @ApiProperty({ example: '13800138000' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ example: '110101199001011234' })
  @IsOptional()
  @IsString()
  idCard?: string;

  @ApiProperty({ example: 1, description: '楼栋号 1-7' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  buildingNo: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitNo: number;

  @ApiProperty({ example: '101' })
  @IsString()
  roomNo: string;

  @ApiProperty({ example: 89.5, description: '房屋面积(㎡)' })
  @Type(() => Number)
  @IsNumber()
  area: number;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsDateString()
  checkInDate?: string;

  @ApiProperty({
    enum: STATUS_LIST,
    default: 'self_occupied',
    description: 'self_occupied 自住 / rented 出租 / vacant 空置 / decorating 装修中',
  })
  @IsOptional()
  @IsIn(STATUS_LIST)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateOwnerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idCard?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  area?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  checkInDate?: string;

  @ApiPropertyOptional({ enum: STATUS_LIST })
  @IsOptional()
  @IsIn(STATUS_LIST)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class OwnerQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  buildingNo?: number;

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
