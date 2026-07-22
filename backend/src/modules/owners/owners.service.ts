import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Owner } from './owner.entity';
import {
  CreateOwnerDto,
  UpdateOwnerDto,
  OwnerQueryDto,
} from './dto/owner.dto';
import { Room } from '../rooms/room.entity';

@Injectable()
export class OwnersService {
  constructor(
    @InjectRepository(Owner)
    private readonly repo: Repository<Owner>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
  ) {}

  /** 拼接完整房号 */
  private buildFullRoomNo(buildingNo: number, unitNo: number, roomNo: string) {
    return `${buildingNo}栋${unitNo}单元${roomNo}`;
  }

  async list(q: OwnerQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: FindOptionsWhere<Owner> = {};
    if (q.buildingNo) where.buildingNo = q.buildingNo;
    if (q.status) where.status = q.status as any;

    const qb = this.repo.createQueryBuilder('o');
    if (q.buildingNo) qb.andWhere('o.buildingNo = :b', { b: q.buildingNo });
    if (q.status) qb.andWhere('o.status = :s', { s: q.status });
    if (q.keyword) {
      qb.andWhere(
        '(o.name LIKE :kw OR o.phone LIKE :kw OR o.fullRoomNo LIKE :kw)',
        { kw: `%${q.keyword}%` },
      );
    }
    qb.orderBy('o.buildingNo', 'ASC')
      .addOrderBy('o.unitNo', 'ASC')
      .addOrderBy('o.roomNo', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async detail(id: number) {
    const owner = await this.repo.findOne({ where: { id } });
    if (!owner) throw new NotFoundException('业主不存在');
    return owner;
  }

  async create(dto: CreateOwnerDto): Promise<Owner> {
    const fullRoomNo = this.buildFullRoomNo(
      dto.buildingNo,
      dto.unitNo,
      dto.roomNo,
    );
    // 同一房号只能有一个业主记录
    const exist = await this.repo.findOne({ where: { fullRoomNo } });
    if (exist) {
      throw new ConflictException(`房号 ${fullRoomNo} 已存在业主记录`);
    }
    const owner = this.repo.create({
      ...dto,
      fullRoomNo,
      status: (dto.status as any) || 'self_occupied',
      checkInDate: dto.checkInDate ? new Date(dto.checkInDate) : null,
    });
    const saved = await this.repo.save(owner);

    // 同步更新房间表状态
    await this.syncRoom(fullRoomNo, saved.status, saved.name);

    return saved;
  }

  async update(id: number, dto: UpdateOwnerDto): Promise<Owner> {
    const owner = await this.repo.findOne({ where: { id } });
    if (!owner) throw new NotFoundException('业主不存在');
    Object.assign(owner, dto, {
      checkInDate: dto.checkInDate ? new Date(dto.checkInDate) : owner.checkInDate,
    });
    const saved = await this.repo.save(owner);

    // 同步房间状态
    await this.syncRoom(owner.fullRoomNo, saved.status, saved.name);

    return saved;
  }

  async remove(id: number) {
    const owner = await this.repo.findOne({ where: { id } });
    if (!owner) throw new NotFoundException('业主不存在');
    const fullRoomNo = owner.fullRoomNo;
    await this.repo.delete(id);
    // 房间恢复空置
    await this.syncRoom(fullRoomNo, 'vacant', null);
    return { success: true };
  }

  /** 业主操作后同步房间表状态 */
  private async syncRoom(
    fullRoomNo: string,
    status: string,
    ownerName: string | null,
  ) {
    const room = await this.roomRepo.findOne({ where: { fullRoomNo } });
    if (room) {
      room.status = status as any;
      room.ownerName = ownerName;
      await this.roomRepo.save(room);
    }
  }

  /** 统计：业主总数、各状态数量 */
  async statistics() {
    const total = await this.repo.count();
    const byStatus = await this.repo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status')
      .getRawMany();
    const byBuilding = await this.repo
      .createQueryBuilder('o')
      .select('o.buildingNo', 'buildingNo')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.buildingNo')
      .orderBy('o.buildingNo', 'ASC')
      .getRawMany();
    return { total, byStatus, byBuilding };
  }
}
