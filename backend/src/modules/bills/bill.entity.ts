import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 账单类型
 *  - property  物业费 (按面积 × 单价 × 月数)
 *  - elevator  电梯费 (按户/按月固定)
 *  - parking   停车费 (按车位 × 月数)
 *
 * 缴费状态
 *  - unpaid   未缴
 *  - partial  部分缴费
 *  - paid     已缴清
 *  - overdue  逾期
 */
@Entity('bill')
@Index(['ownerId'])
@Index(['period'])
@Index(['status'])
@Index(['fullRoomNo'])
export class Bill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true, type: 'int', comment: '业主ID' })
  ownerId: number;

  @Column({ length: 50, comment: '业主姓名' })
  ownerName: string;

  @Column({ length: 50, comment: '房号 (如 1栋1单元101)' })
  fullRoomNo: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, comment: '房屋面积' })
  area: number;

  @Column({
    length: 20,
    comment: '账单类型: property/elevator/parking',
  })
  billType: string;

  @Column({ length: 20, comment: '计费周期 (如 2024-01 或 2024-Q1)' })
  period: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '单价 (物业费:元/㎡/月; 电梯费:元/户/月; 停车费:元/月)',
  })
  unitPrice: number;

  @Column({ type: 'int', default: 1, comment: '计费月数' })
  months: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '应缴金额',
  })
  amount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '实缴金额',
  })
  paidAmount: number;

  @Column({
    length: 20,
    default: 'unpaid',
    comment: '状态: unpaid/partial/paid/overdue',
  })
  status: string;

  @Column({ type: 'datetime', nullable: true, comment: '缴费时间' })
  paidAt: Date;

  @Column({ length: 50, nullable: true, comment: '操作人（收费人）' })
  operator: string;

  @Column({ type: 'date', nullable: true, comment: '应缴截止日期' })
  dueDate: Date;

  @Column({ type: 'text', nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
