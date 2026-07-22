import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 角色：
 *  - super_admin 超级管理员（全部权限）
 *  - admin       物业管理员（日常业务）
 *  - finance     财务（仅财务相关）
 */
@Entity('sys_user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50, comment: '登录账号' })
  username: string;

  @Column({ length: 100, comment: '密码（bcrypt 加密）' })
  password: string;

  @Column({ length: 50, comment: '真实姓名' })
  realName: string;

  @Column({
    length: 20,
    default: 'admin',
    comment: '角色：super_admin/admin/finance',
  })
  role: string;

  @Column({ length: 20, nullable: true, comment: '手机号' })
  phone: string;

  @Column({ default: true, comment: '是否启用' })
  enabled: boolean;

  @Column({ nullable: true, type: 'datetime', comment: '最后登录时间' })
  lastLoginAt: Date;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;
}
