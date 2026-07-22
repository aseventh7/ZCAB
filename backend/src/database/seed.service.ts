import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../modules/users/user.entity';
import { Building } from '../modules/buildings/building.entity';
import { Room } from '../modules/rooms/room.entity';
import { Parking } from '../modules/parking/parking.entity';
import { CryptoUtil } from '../common/utils/crypto.util';

/**
 * 数据初始化服务
 *  - 启动时自动创建默认超级管理员（如不存在）
 *  - 自动创建 7 栋楼配置 + 房间结构（如不存在）
 *  - 自动生成示例地下车位（如不存在）
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Building)
    private readonly buildingRepo: Repository<Building>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    @InjectRepository(Parking)
    private readonly parkingRepo: Repository<Parking>,
  ) {}

  async onModuleInit() {
    try {
      await this.seedAdmin();
      await this.seedBuildings();
      await this.seedSampleParking();
      this.logger.log('数据初始化完成 ✓');
    } catch (e) {
      this.logger.error(`数据初始化失败: ${(e as Error).message}`, (e as Error).stack);
    }
  }

  /** 1. 默认管理员 */
  private async seedAdmin() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const exist = await this.userRepo.findOne({ where: { username } });
    if (exist) {
      this.logger.log(`管理员账号 ${username} 已存在，跳过创建`);
      return;
    }
    const admin = this.userRepo.create({
      username,
      password: await CryptoUtil.hash(password),
      realName: '系统管理员',
      role: 'super_admin',
      enabled: true,
    });
    await this.userRepo.save(admin);
    this.logger.log(`已创建默认管理员：${username} / ${password}`);
  }

  /** 2. 7 栋楼 + 房间结构 */
  private async seedBuildings() {
    const count = await this.buildingRepo.count();
    if (count > 0) {
      this.logger.log(`楼栋已存在 ${count} 栋，跳过创建`);
      return;
    }
    // 7 栋楼配置：1-3 号楼 2 单元 18 层 每层 4 户；4-7 号楼 2 单元 15 层 每层 4 户
    const configs = [
      { buildingNo: 1, name: '1号楼', units: 2, floors: 18, roomsPerFloor: 4 },
      { buildingNo: 2, name: '2号楼', units: 2, floors: 18, roomsPerFloor: 4 },
      { buildingNo: 3, name: '3号楼', units: 2, floors: 18, roomsPerFloor: 4 },
      { buildingNo: 4, name: '4号楼', units: 2, floors: 15, roomsPerFloor: 4 },
      { buildingNo: 5, name: '5号楼', units: 2, floors: 15, roomsPerFloor: 4 },
      { buildingNo: 6, name: '6号楼', units: 2, floors: 15, roomsPerFloor: 4 },
      { buildingNo: 7, name: '7号楼', units: 2, floors: 15, roomsPerFloor: 4 },
    ];

    for (const cfg of configs) {
      await this.buildingRepo.save(this.buildingRepo.create(cfg));
    }
    this.logger.log(`已创建 ${configs.length} 栋楼配置`);

    // 生成所有房间
    const rooms: Room[] = [];
    for (const cfg of configs) {
      for (let u = 1; u <= cfg.units; u++) {
        for (let f = 1; f <= cfg.floors; f++) {
          for (let r = 1; r <= cfg.roomsPerFloor; r++) {
            const roomNo = `${f}${String(r).padStart(2, '0')}`;
            const fullRoomNo = `${cfg.buildingNo}栋${u}单元${roomNo}`;
            rooms.push(
              this.roomRepo.create({
                buildingNo: cfg.buildingNo,
                unitNo: u,
                floorNo: f,
                roomNo,
                fullRoomNo,
                status: 'unsold',
                area: 0,
              }),
            );
          }
        }
      }
    }
    // 分批插入（SQLite 单次插入有限制）
    const batchSize = 200;
    for (let i = 0; i < rooms.length; i += batchSize) {
      await this.roomRepo.save(rooms.slice(i, i + batchSize));
    }
    this.logger.log(`已生成 ${rooms.length} 套房间`);
  }

  /** 3. 示例地下车位（A 区 50 个） */
  private async seedSampleParking() {
    const count = await this.parkingRepo.count();
    if (count > 0) {
      this.logger.log(`车位已存在 ${count} 个，跳过创建`);
      return;
    }
    const parkings: Parking[] = [];
    for (let i = 1; i <= 50; i++) {
      parkings.push(
        this.parkingRepo.create({
          code: `A-${String(i).padStart(3, '0')}`,
          type: 'underground',
          status: 'free',
          price: 300,
        }),
      );
    }
    await this.parkingRepo.save(parkings);
    this.logger.log(`已生成 ${parkings.length} 个示例车位（A 区地下）`);
  }
}
