import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'admin123' })
  @IsString()
  oldPassword: string;

  @ApiProperty({ example: 'newpass456' })
  @IsString()
  @MinLength(6, { message: '新密码至少 6 位' })
  newPassword: string;
}
