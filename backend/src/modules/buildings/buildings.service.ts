import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Building } from './building.entity';
import { Room } from '../rooms/room.entity';
import { CreateBuildingDto, UpdateBuildingDto } from './dto/building.dto';

@Injectable()
export class BuildingsService {
  constructor(
    @InjectRepository(Building)
    private readonly repo: Repository<Building>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
  ) {}

  async list() {
    return this.repo.find({ order: { buildingNo: 'ASC' } });
  }

  async detail(buildingNo: number) {
    const b = await this.repo.findOne({ where: { buildingNo } });
    if (!b) throw new NotFoundException('楼栋不存在');
    return b;
  }

  async create(dto: CreateBuildingDto): Promise<Building> {
    const exist = await this.repo.findOne({
      where: { buildingNo: dto.buildingNo },
    });
    if (exist) throw new Error(`楼栋 ${dto.buildingNo} 已存在`);
    const b = this.repo.create(dto);
    return this.repo.save(b);
  }

  async update(buildingNo: number, dto: UpdateBuildingDto): Promise<Building> {
    const b = await this.repo.findOne({ where: { buildingNo } });
    if (!b) throw new NotFoundException('楼栋不存在');
    Object.assign(b, dto);
    return this.repo.save(b);
  }

  async remove(buildingNo: number) {
    const b = await this.repo.findOne({ where: { buildingNo } });
    if (!b) throw new NotFoundException('楼栋不存在');
    await this.repo.delete({ buildingNo });
    // 同步删除该楼栋所有房间
    await this.roomRepo.delete({ buildingNo });
    return { success: true };
  }

  /** 根据楼栋配置生成所有房间（幂等：已存在的跳过） */
  async generateRooms(buildingNo: number) {
    const b = await this.repo.findOne({ where: { buildingNo } });
    if (!b) throw new NotFoundException('楼栋不存在，请先创建楼栋');

    const rooms: Room[] = [];
    let created = 0;
    let skipped = 0;
    for (let u = 1; u <= b.units; u++) {
      for (let f = 1; f <= b.floors; f++) {
        for (let r = 1; r <= b.roomsPerFloor; r++) {
          // 房号规则：楼层 + 房间序号，如 1层01室 => 101
          const roomNo = `${f}${String(r).padStart(2, '0')}`;
          const fullRoomNo = `${buildingNo}栋${u}单元${roomNo}`;
          const exist = await this.roomRepo.findOne({ where: { fullRoomNo } });
          if (exist) {
            skipped++;
            continue;
          }
          rooms.push(
            this.roomRepo.create({
              buildingNo,
              unitNo: u,
              floorNo: f,
              roomNo,
              fullRoomNo,
              status: 'unsold',
              area: 0,
            }),
          );
          created++;
        }
      }
    }
    if (rooms.length > 0) {
      await this.roomRepo.save(rooms);
    }
    return {
      buildingNo,
      buildingName: b.name,
      created,
      skipped,
      total: created + skipped,
    };
  }

  /** 一键生成所有楼栋的房间 */
  async generateAllRooms() {
    const buildings = await this.repo.find({ order: { buildingNo: 'ASC' } });
    const results: any[] = [];
    for (const b of buildings) {
      results.push(await this.generateRooms(b.buildingNo));
    }
    return results;
  }
}
