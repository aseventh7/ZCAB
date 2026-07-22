import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('building')
export class Building {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true, comment: '楼栋号 (1-7)' })
  buildingNo: number;

  @Column({ length: 50, comment: '楼栋名称 (如 1号楼)' })
  name: string;

  @Column({ type: 'int', default: 2, comment: '单元数' })
  units: number;

  @Column({ type: 'int', default: 18, comment: '楼层数' })
  floors: number;

  @Column({ type: 'int', default: 4, comment: '每层户数' })
  roomsPerFloor: number;

  @Column({ length: 255, nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
