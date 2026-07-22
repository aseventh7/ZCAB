import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CryptoUtil } from '../../common/utils/crypto.util';
import { LoginDto, ChangePasswordDto } from './dto/login.dto';
import { JwtUserPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('账号或密码错误');
    }
    if (!user.enabled) {
      throw new UnauthorizedException('账号已被禁用，请联系超级管理员');
    }
    const ok = await CryptoUtil.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('账号或密码错误');
    }
    await this.usersService.updateLastLogin(user.id);

    const payload: JwtUserPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      realName: user.realName,
    };
    const token = await this.jwtService.signAsync(payload);
    return {
      token,
      user: this.usersService.sanitize(user),
    };
  }

  async profile(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');
    return this.usersService.sanitize(user);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');
    const ok = await CryptoUtil.compare(dto.oldPassword, user.password);
    if (!ok) {
      throw new UnauthorizedException('原密码错误');
    }
    await this.usersService.resetPassword(userId, {
      newPassword: dto.newPassword,
    });
    return { success: true };
  }
}
