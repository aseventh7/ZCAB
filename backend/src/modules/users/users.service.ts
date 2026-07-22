import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from './user.entity';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CryptoUtil } from '../../common/utils/crypto.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  async findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async updateLastLogin(id: number) {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }

  async list(pagination: PaginationDto) {
    const where: any = {};
    if (pagination.keyword) {
      where.username = Like(`%${pagination.keyword}%`);
    }
    const [list, total] = await this.repo.findAndCount({
      where,
      skip: pagination.skip,
      take: pagination.take,
      order: { id: 'ASC' },
    });
    return {
      list: list.map((u) => this.sanitize(u)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async create(dto: CreateUserDto): Promise<User> {
    const exist = await this.repo.findOne({
      where: { username: dto.username },
    });
    if (exist) {
      throw new Error(`账号 ${dto.username} 已存在`);
    }
    const user = this.repo.create({
      ...dto,
      password: await CryptoUtil.hash(dto.password),
      enabled: dto.enabled ?? true,
    });
    return this.repo.save(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    Object.assign(user, dto);
    return this.repo.save(user);
  }

  async resetPassword(id: number, dto: ResetPasswordDto) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.password = await CryptoUtil.hash(dto.newPassword);
    await this.repo.save(user);
    return { success: true };
  }

  async remove(id: number) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.role === 'super_admin') {
      throw new Error('超级管理员账号不可删除');
    }
    await this.repo.delete(id);
    return { success: true };
  }

  /** 返回时去掉密码字段 */
  sanitize(user: User) {
    const { password, ...rest } = user;
    return rest;
  }
}
