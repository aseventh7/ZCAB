import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 居住状态
 *  - self_occupied 自住
 *  - rented        出租
 *  - vacant        空置
 *  - decorating    装修中
 */
export type OwnerStatus = 'self_occupied' | 'rented' | 'vacant' | 'decorating';

@Entity('owner')
@Index(['buildingNo', 'unitNo', 'roomNo'])
export class Owner {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, comment: '业主姓名' })
  name: string;

  @Column({ length: 20, comment: '联系电话' })
  phone: string;

  @Column({ length: 20, nullable: true, comment: '身份证号' })
  idCard: string;

  @Column({ type: 'int', comment: '楼栋号 (1-7)' })
  buildingNo: number;

  @Column({ type: 'int', default: 1, comment: '单元号' })
  unitNo: number;

  @Column({ length: 10, comment: '房号 (如 101)' })
  roomNo: string;

  @Column({
    length: 50,
    comment: '完整房号 (如 1栋1单元101)',
  })
  fullRoomNo: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, comment: '房屋面积(㎡)' })
  area: number;

  @Column({ type: 'date', nullable: true, comment: '入住时间' })
  checkInDate: Date;

  @Column({
    length: 20,
    default: 'self_occupied',
    comment: '居住状态',
  })
  status: OwnerStatus;

  @Column({ length: 50, nullable: true, comment: '紧急联系人' })
  emergencyContact: string;

  @Column({ length: 20, nullable: true, comment: '紧急联系电话' })
  emergencyPhone: string;

  @Column({ type: 'text', nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;
}
