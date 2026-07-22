import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'zhangsan' })
  @IsString()
  username: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;

  @ApiProperty({ example: '张三' })
  @IsString()
  realName: string;

  @ApiProperty({ example: 'admin', description: 'super_admin / admin / finance' })
  @IsIn(['super_admin', 'admin', 'finance'])
  role: string;

  @ApiPropertyOptional({ example: '13800138000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  realName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['super_admin', 'admin', 'finance'])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'newpass123' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  newPassword: string;
}
