import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 车位类型
 *  - ground     地上车位
 *  - underground 地下车位
 *  - mechanical 机械车位
 *
 * 租赁状态
 *  - free    空闲
 *  - sold    已售
 *  - rented  已租
 *  - reserved 预留
 */
@Entity('parking')
@Index(['status'])
export class Parking {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30, unique: true, comment: '车位编号 (如 A-001)' })
  code: string;

  @Column({
    length: 20,
    default: 'underground',
    comment: '车位类型: ground/underground/mechanical',
  })
  type: string;

  @Column({
    length: 20,
    default: 'free',
    comment: '状态: free/sold/rented/reserved',
  })
  status: string;

  @Column({ nullable: true, type: 'int', comment: '绑定业主ID' })
  ownerId: number;

  @Column({ length: 50, nullable: true, comment: '业主姓名（冗余）' })
  ownerName: string;

  @Column({ length: 50, nullable: true, comment: '业主房号（冗余）' })
  ownerFullRoomNo: string;

  @Column({ type: 'date', nullable: true, comment: '租赁/购买开始日期' })
  startDate: Date;

  @Column({ type: 'date', nullable: true, comment: '租赁/购买结束日期' })
  endDate: Date;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '车位价格/月租金',
  })
  price: number;

  @Column({ type: 'text', nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
