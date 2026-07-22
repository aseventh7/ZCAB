import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './room.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly repo: Repository<Room>,
  ) {}

  /** 楼宇预览：按楼栋聚合每户状态，用于平面图展示 */
  async overview() {
    const buildings = await this.repo
      .createQueryBuilder('r')
      .select([
        'r.buildingNo AS buildingNo',
        'r.unitNo AS unitNo',
        'r.floorNo AS floorNo',
        'r.roomNo AS roomNo',
        'r.fullRoomNo AS fullRoomNo',
        'r.status AS status',
        'r.ownerName AS ownerName',
        'r.area AS area',
      ])
      .orderBy('r.buildingNo', 'ASC')
      .addOrderBy('r.unitNo', 'ASC')
      .addOrderBy('r.floorNo', 'ASC')
      .addOrderBy('r.roomNo', 'ASC')
      .getRawMany();

    // 聚合成 { buildingNo, units: [ { unitNo, floors: [ { floorNo, rooms: [...] } ] } ] }
    const buildingMap = new Map<number, any>();
    for (const r of buildings) {
      if (!buildingMap.has(r.buildingNo)) {
        buildingMap.set(r.buildingNo, {
          buildingNo: r.buildingNo,
          units: new Map<number, any>(),
        });
      }
      const b = buildingMap.get(r.buildingNo);
      if (!b.units.has(r.unitNo)) {
        b.units.set(r.unitNo, {
          unitNo: r.unitNo,
          floors: new Map<number, any>(),
        });
      }
      const u = b.units.get(r.unitNo);
      if (!u.floors.has(r.floorNo)) {
        u.floors.set(r.floorNo, { floorNo: r.floorNo, rooms: [] });
      }
      u.floors.get(r.floorNo).rooms.push(r);
    }

    const result: any[] = [];
    for (const b of buildingMap.values()) {
      result.push({
        buildingNo: b.buildingNo,
        units: Array.from(b.units.values()).map((u: any) => ({
          unitNo: u.unitNo,
          floors: Array.from(u.floors.values()).map((f: any) => ({
            floorNo: f.floorNo,
            rooms: f.rooms,
          })),
        })),
      });
    }
    return result;
  }

  async list(q: {
    buildingNo?: number;
    unitNo?: number;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 200;
    const qb = this.repo.createQueryBuilder('r');
    if (q.buildingNo) qb.andWhere('r.buildingNo = :b', { b: q.buildingNo });
    if (q.unitNo) qb.andWhere('r.unitNo = :u', { u: q.unitNo });
    if (q.status) qb.andWhere('r.status = :s', { s: q.status });
    qb.orderBy('r.buildingNo', 'ASC')
      .addOrderBy('r.unitNo', 'ASC')
      .addOrderBy('r.floorNo', 'ASC')
      .addOrderBy('r.roomNo', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async detail(id: number) {
    const room = await this.repo.findOne({ where: { id } });
    if (!room) throw new NotFoundException('房间不存在');
    return room;
  }

  async updateStatus(id: number, status: string) {
    const room = await this.repo.findOne({ where: { id } });
    if (!room) throw new NotFoundException('房间不存在');
    room.status = status as any;
    if (status === 'vacant' || status === 'unsold') {
      room.ownerName = null;
    }
    return this.repo.save(room);
  }

  async updateArea(id: number, area: number) {
    const room = await this.repo.findOne({ where: { id } });
    if (!room) throw new NotFoundException('房间不存在');
    room.area = area;
    return this.repo.save(room);
  }

  /** 统计：各状态房间数量 */
  async statistics() {
    const total = await this.repo.count();
    const byStatus = await this.repo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.status')
      .getRawMany();
    const byBuilding = await this.repo
      .createQueryBuilder('r')
      .select('r.buildingNo', 'buildingNo')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        "SUM(CASE WHEN r.status='self_occupied' THEN 1 ELSE 0 END)",
        'selfOccupied',
      )
      .addSelect(
        "SUM(CASE WHEN r.status='rented' THEN 1 ELSE 0 END)",
        'rented',
      )
      .addSelect("SUM(CASE WHEN r.status='vacant' THEN 1 ELSE 0 END)", 'vacant')
      .addSelect(
        "SUM(CASE WHEN r.status='unsold' THEN 1 ELSE 0 END)",
        'unsold',
      )
      .groupBy('r.buildingNo')
      .orderBy('r.buildingNo', 'ASC')
      .getRawMany();
    return { total, byStatus, byBuilding };
  }
}
