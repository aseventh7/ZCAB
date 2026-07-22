import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 财务收支类型
 *  - income  收入
 *  - expense 支出
 *
 * 收入分类：property 物业费 / elevator 电梯费 / parking 停车费 / other 其他
 * 支出分类：salary 工资 / maintenance 维修 / utility 水电 / cleaning 保洁 / other 其他
 */
@Entity('finance_record')
@Index(['type'])
@Index(['category'])
@Index(['recordDate'])
export class FinanceRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10, comment: 'income / expense' })
  type: string;

  @Column({ length: 50, comment: '分类' })
  category: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '金额',
  })
  amount: number;

  @Column({ type: 'date', comment: '发生日期' })
  recordDate: Date;

  @Column({ length: 50, nullable: true, comment: '操作人' })
  operator: string;

  @Column({ nullable: true, type: 'int', comment: '关联账单ID（缴费自动产生）' })
  relatedBillId: number;

  @Column({ type: 'text', nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
