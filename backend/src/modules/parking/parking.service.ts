import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parking } from './parking.entity';
import {
  CreateParkingDto,
  UpdateParkingDto,
  BindOwnerDto,
  ParkingQueryDto,
} from './dto/parking.dto';
import { Owner } from '../owners/owner.entity';

@Injectable()
export class ParkingService {
  constructor(
    @InjectRepository(Parking)
    private readonly repo: Repository<Parking>,
    @InjectRepository(Owner)
    private readonly ownerRepo: Repository<Owner>,
  ) {}

  async list(q: ParkingQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const qb = this.repo.createQueryBuilder('p');
    if (q.type) qb.andWhere('p.type = :t', { t: q.type });
    if (q.status) qb.andWhere('p.status = :s', { s: q.status });
    if (q.keyword) {
      qb.andWhere(
        '(p.code LIKE :kw OR p.ownerName LIKE :kw OR p.ownerFullRoomNo LIKE :kw)',
        { kw: `%${q.keyword}%` },
      );
    }
    qb.orderBy('p.code', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async detail(id: number) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('车位不存在');
    return p;
  }

  async create(dto: CreateParkingDto): Promise<Parking> {
    const exist = await this.repo.findOne({ where: { code: dto.code } });
    if (exist) throw new Error(`车位编号 ${dto.code} 已存在`);
    const p = this.repo.create({
      code: dto.code,
      type: dto.type || 'underground',
      status: 'free',
      price: dto.price,
      remark: dto.remark,
    });
    return this.repo.save(p);
  }

  async update(id: number, dto: UpdateParkingDto): Promise<Parking> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('车位不存在');
    Object.assign(p, dto);
    return this.repo.save(p);
  }

  /** 批量创建车位 */
  async batchCreate(codes: string[], type = 'underground', price?: number) {
    const created: string[] = [];
    const skipped: string[] = [];
    for (const code of codes) {
      const exist = await this.repo.findOne({ where: { code } });
      if (exist) {
        skipped.push(code);
        continue;
      }
      await this.repo.save(
        this.repo.create({ code, type, status: 'free', price }),
      );
      created.push(code);
    }
    return { created, skipped, createdCount: created.length };
  }

  /** 绑定业主 */
  async bindOwner(id: number, dto: BindOwnerDto): Promise<Parking> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('车位不存在');

    const owner = await this.ownerRepo.findOne({ where: { id: dto.ownerId } });
    if (!owner) throw new NotFoundException('业主不存在');

    p.ownerId = owner.id;
    p.ownerName = owner.name;
    p.ownerFullRoomNo = owner.fullRoomNo;
    p.status = dto.status;
    p.startDate = dto.startDate ? new Date(dto.startDate) : null;
    p.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.price !== undefined) p.price = dto.price;
    return this.repo.save(p);
  }

  /** 解绑业主 */
  async unbindOwner(id: number): Promise<Parking> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('车位不存在');
    p.ownerId = null;
    p.ownerName = null;
    p.ownerFullRoomNo = null;
    p.status = 'free';
    p.startDate = null;
    p.endDate = null;
    return this.repo.save(p);
  }

  async remove(id: number) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('车位不存在');
    await this.repo.delete(id);
    return { success: true };
  }

  async statistics() {
    const total = await this.repo.count();
    const byStatus = await this.repo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status')
      .getRawMany();
    const byType = await this.repo
      .createQueryBuilder('p')
      .select('p.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.type')
      .getRawMany();
    return { total, byStatus, byType };
  }
}
