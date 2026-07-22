import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateBuildingDto {
  @ApiProperty({ example: 1, description: '楼栋号 1-7' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  buildingNo: number;

  @ApiProperty({ example: '1号楼' })
  @IsString()
  name: string;

  @ApiProperty({ example: 2, description: '单元数' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  units: number;

  @ApiProperty({ example: 18, description: '楼层数' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  floors: number;

  @ApiProperty({ example: 4, description: '每层户数' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomsPerFloor: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateBuildingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  units?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floors?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  roomsPerFloor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}
