import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type RoomStatus =
  | 'self_occupied'
  | 'rented'
  | 'vacant'
  | 'decorating'
  | 'unsold';

@Entity('room')
@Index(['buildingNo', 'unitNo', 'floorNo'])
@Index(['fullRoomNo'])
export class Room {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '楼栋号 (1-7)' })
  buildingNo: number;

  @Column({ type: 'int', comment: '单元号' })
  unitNo: number;

  @Column({ type: 'int', comment: '楼层' })
  floorNo: number;

  @Column({ length: 10, comment: '房号 (如 101)' })
  roomNo: string;

  @Column({ length: 50, unique: true, comment: '完整房号' })
  fullRoomNo: string;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '房屋面积(㎡)',
  })
  area: number;

  @Column({
    length: 20,
    default: 'unsold',
    comment: '状态: self_occupied/rented/vacant/decorating/unsold',
  })
  status: RoomStatus;

  @Column({ length: 50, nullable: true, comment: '当前业主姓名（冗余）' })
  ownerName: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
