import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Bill } from './bill.entity';
import { Owner } from '../owners/owner.entity';
import { Parking } from '../parking/parking.entity';
import { FinanceRecord } from '../finance/finance.entity';
import {
  GenerateBillsDto,
  PayBillDto,
  BatchPayDto,
  BillQueryDto,
  PrintNoticeDto,
} from './dto/bill.dto';
import { JwtUserPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);

  constructor(
    @InjectRepository(Bill)
    private readonly repo: Repository<Bill>,
    @InjectRepository(Owner)
    private readonly ownerRepo: Repository<Owner>,
    @InjectRepository(Parking)
    private readonly parkingRepo: Repository<Parking>,
    @InjectRepository(FinanceRecord)
    private readonly financeRepo: Repository<FinanceRecord>,
    private readonly dataSource: DataSource,
  ) {}

  /** 批量生成账单 */
  async generate(dto: GenerateBillsDto) {
    const months = dto.months || 1;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    if (dto.billType === 'parking') {
      return this.generateParkingBills(dto, months, dueDate);
    }

    // 物业费 / 电梯费：按业主生成
    const qb = this.ownerRepo.createQueryBuilder('o');
    if (dto.ownerIds && dto.ownerIds.length > 0) {
      qb.andWhere('o.id IN (:...ids)', { ids: dto.ownerIds });
    }
    const owners = await qb.getMany();

    let created = 0;
    let skipped = 0;
    const bills: Bill[] = [];

    for (const owner of owners) {
      // 幂等：同业主 + 同周期 + 同类型 不重复
      const exist = await this.repo.findOne({
        where: {
          ownerId: owner.id,
          period: dto.period,
          billType: dto.billType,
        },
      });
      if (exist) {
        skipped++;
        continue;
      }
      const amount = this.calcAmount(
        dto.billType,
        owner.area,
        dto.unitPrice,
        months,
      );
      bills.push(
        this.repo.create({
          ownerId: owner.id,
          ownerName: owner.name,
          fullRoomNo: owner.fullRoomNo,
          area: owner.area,
          billType: dto.billType,
          period: dto.period,
          unitPrice: dto.unitPrice,
          months,
          amount,
          paidAmount: 0,
          status: 'unpaid',
          dueDate,
          remark: dto.remark,
        }),
      );
      created++;
    }
    if (bills.length > 0) {
      await this.repo.save(bills);
    }
    this.logger.log(
      `生成 ${dto.billType} 账单 ${dto.period}: 新增 ${created}, 跳过 ${skipped}`,
    );
    return {
      billType: dto.billType,
      period: dto.period,
      created,
      skipped,
      total: created + skipped,
    };
  }

  /** 停车费账单：按已绑定的车位生成 */
  private async generateParkingBills(
    dto: GenerateBillsDto,
    months: number,
    dueDate: Date | null,
  ) {
    const parkings = await this.parkingRepo.find({
      where: { status: In(['sold', 'rented']) },
    });
    let created = 0;
    let skipped = 0;
    const bills: Bill[] = [];
    for (const p of parkings) {
      if (dto.ownerIds && !dto.ownerIds.includes(p.ownerId)) continue;
      const fullRoomNoForParking = `${p.code}(${p.ownerFullRoomNo || ''})`;
      const exist = await this.repo.findOne({
        where: {
          ownerId: p.ownerId,
          period: dto.period,
          billType: 'parking',
          fullRoomNo: fullRoomNoForParking,
        },
      });
      if (exist) {
        skipped++;
        continue;
      }
      const amount = Number(dto.unitPrice) * months;
      bills.push(
        this.repo.create({
          ownerId: p.ownerId,
          ownerName: p.ownerName,
          fullRoomNo: fullRoomNoForParking,
          area: 0,
          billType: 'parking',
          period: dto.period,
          unitPrice: dto.unitPrice,
          months,
          amount,
          paidAmount: 0,
          status: 'unpaid',
          dueDate,
          remark: dto.remark,
        }),
      );
      created++;
    }
    if (bills.length > 0) await this.repo.save(bills);
    return {
      billType: 'parking',
      period: dto.period,
      created,
      skipped,
      total: created + skipped,
    };
  }

  /** 计算应缴金额 */
  private calcAmount(
    billType: string,
    area: number,
    unitPrice: number,
    months: number,
  ): number {
    if (billType === 'property') {
      // 物业费 = 面积 × 单价 × 月数
      return Number((area * unitPrice * months).toFixed(2));
    }
    if (billType === 'elevator') {
      // 电梯费 = 单价 × 月数（按户/月）
      return Number((unitPrice * months).toFixed(2));
    }
    return Number((unitPrice * months).toFixed(2));
  }

  async list(q: BillQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const qb = this.repo.createQueryBuilder('b');
    if (q.billType) qb.andWhere('b.billType = :t', { t: q.billType });
    if (q.status) qb.andWhere('b.status = :s', { s: q.status });
    if (q.period) qb.andWhere('b.period = :p', { p: q.period });
    if (q.ownerId) qb.andWhere('b.ownerId = :o', { o: q.ownerId });
    if (q.keyword) {
      qb.andWhere(
        '(b.ownerName LIKE :kw OR b.fullRoomNo LIKE :kw)',
        { kw: `%${q.keyword}%` },
      );
    }
    qb.orderBy('b.period', 'DESC')
      .addOrderBy('b.status', 'ASC')
      .addOrderBy('b.fullRoomNo', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async detail(id: number) {
    const b = await this.repo.findOne({ where: { id } });
    if (!b) throw new NotFoundException('账单不存在');
    return b;
  }

  /** 单个缴费 */
  async pay(id: number, dto: PayBillDto, user: JwtUserPayload) {
    const bill = await this.repo.findOne({ where: { id } });
    if (!bill) throw new NotFoundException('账单不存在');
    if (bill.status === 'paid') {
      throw new BadRequestException('该账单已缴清');
    }
    const newPaid = Number(bill.paidAmount) + Number(dto.paidAmount);
    bill.paidAmount = newPaid;
    if (newPaid >= Number(bill.amount)) {
      bill.status = 'paid';
    } else if (newPaid > 0) {
      bill.status = 'partial';
    }
    bill.paidAt = new Date();
    bill.operator = user.realName || user.username;
    if (dto.remark) bill.remark = dto.remark;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Bill, bill);
      // 联动财务收支表：记一笔收入
      await manager.save(FinanceRecord, {
        type: 'income',
        category: this.financeCategory(bill.billType),
        amount: Number(dto.paidAmount),
        remark: `${bill.ownerName} ${bill.fullRoomNo} ${bill.period} ${this.billTypeLabel(bill.billType)}缴费`,
        operator: user.realName || user.username,
        relatedBillId: bill.id,
        recordDate: new Date(),
      });
    });
    return bill;
  }

  /** 批量缴费（按账单ID数组，全额缴清） */
  async batchPay(dto: BatchPayDto, user: JwtUserPayload) {
    const bills = await this.repo.find({
      where: { id: In(dto.billIds) },
    });
    if (bills.length === 0) {
      throw new NotFoundException('未找到对应账单');
    }
    const records: FinanceRecord[] = [];
    let totalPaid = 0;
    for (const bill of bills) {
      if (bill.status === 'paid') continue;
      const payAmount =
        dto.paidAmount !== undefined
          ? Number(dto.paidAmount)
          : Number(bill.amount) - Number(bill.paidAmount);
      bill.paidAmount = Number(bill.paidAmount) + payAmount;
      bill.status =
        bill.paidAmount >= Number(bill.amount) ? 'paid' : 'partial';
      bill.paidAt = new Date();
      bill.operator = user.realName || user.username;
      totalPaid += payAmount;
      records.push({
        type: 'income',
        category: this.financeCategory(bill.billType),
        amount: payAmount,
        remark: `${bill.ownerName} ${bill.fullRoomNo} ${bill.period} ${this.billTypeLabel(bill.billType)}缴费(批量)`,
        operator: user.realName || user.username,
        relatedBillId: bill.id,
        recordDate: new Date(),
      } as FinanceRecord);
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.save(Bill, bills);
      if (records.length > 0) await manager.save(FinanceRecord, records);
    });
    return {
      paidCount: bills.length,
      totalPaid: Number(totalPaid.toFixed(2)),
    };
  }

  /** 催缴通知单数据（批量/单个） */
  async noticeData(dto: PrintNoticeDto) {
    const bills = await this.repo.find({
      where: { id: In(dto.billIds) },
    });
    // 按业主房号聚合：同一业主的多张欠费账单合到一张通知单
    const groupMap = new Map<string, any>();
    for (const b of bills) {
      const key = `${b.ownerId}_${b.fullRoomNo}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          ownerName: b.ownerName,
          fullRoomNo: b.fullRoomNo,
          area: b.area,
          ownerId: b.ownerId,
          items: [] as any[],
          totalAmount: 0,
          totalPaid: 0,
          totalUnpaid: 0,
        });
      }
      const g = groupMap.get(key);
      g.items.push({
        billType: b.billType,
        billTypeLabel: this.billTypeLabel(b.billType),
        period: b.period,
        amount: Number(b.amount),
        paidAmount: Number(b.paidAmount),
        unpaid: Number(b.amount) - Number(b.paidAmount),
        status: b.status,
        dueDate: b.dueDate,
      });
      g.totalAmount += Number(b.amount);
      g.totalPaid += Number(b.paidAmount);
      g.totalUnpaid += Number(b.amount) - Number(b.paidAmount);
    }
    const notices: any[] = [];
    for (const g of groupMap.values()) {
      notices.push({
        ...g,
        totalAmount: Number(g.totalAmount.toFixed(2)),
        totalPaid: Number(g.totalPaid.toFixed(2)),
        totalUnpaid: Number(g.totalUnpaid.toFixed(2)),
        communityName: '德馨苑小区',
        printDate: new Date().toISOString().slice(0, 10),
      });
    }
    return { notices, count: notices.length };
  }

  /** 统计 */
  async statistics(period?: string) {
    const qb = this.repo.createQueryBuilder('b');
    if (period) qb.andWhere('b.period = :p', { p: period });

    const totalAmount = await qb
      .select('COALESCE(SUM(b.amount),0)', 'total')
      .getRawOne();
    const totalPaid = await qb
      .select('COALESCE(SUM(b.paidAmount),0)', 'total')
      .getRawOne();

    const byStatus = await this.repo
      .createQueryBuilder('b')
      .select('b.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(b.amount),0)', 'amount')
      .addSelect('COALESCE(SUM(b.paidAmount),0)', 'paid')
      .groupBy('b.status')
      .getRawMany();

    const byType = await this.repo
      .createQueryBuilder('b')
      .select('b.billType', 'billType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(b.amount),0)', 'amount')
      .addSelect('COALESCE(SUM(b.paidAmount),0)', 'paid')
      .groupBy('b.billType')
      .getRawMany();

    const byPeriod = await this.repo
      .createQueryBuilder('b')
      .select('b.period', 'period')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(b.amount),0)', 'amount')
      .addSelect('COALESCE(SUM(b.paidAmount),0)', 'paid')
      .groupBy('b.period')
      .orderBy('b.period', 'DESC')
      .limit(12)
      .getRawMany();

    return {
      totalAmount: Number(totalAmount.total),
      totalPaid: Number(totalPaid.total),
      totalUnpaid: Number(
        (Number(totalAmount.total) - Number(totalPaid.total)).toFixed(2),
      ),
      byStatus,
      byType,
      byPeriod,
    };
  }

  /** 查询某业主的所有账单（历史账单） */
  async ownerBills(ownerId: number) {
    return this.repo.find({
      where: { ownerId },
      order: { period: 'DESC', billType: 'ASC' },
    });
  }

  /** 标记逾期（截止日期已过且未缴清） */
  async markOverdue() {
    const today = new Date();
    const overdueBills = await this.repo
      .createQueryBuilder('b')
      .where('b.status IN (:...statuses)', { statuses: ['unpaid', 'partial'] })
      .andWhere('b.dueDate IS NOT NULL')
      .andWhere('b.dueDate < :today', { today })
      .getMany();
    for (const b of overdueBills) {
      b.status = 'overdue';
    }
    if (overdueBills.length > 0) await this.repo.save(overdueBills);
    return { marked: overdueBills.length };
  }

  async remove(id: number) {
    const b = await this.repo.findOne({ where: { id } });
    if (!b) throw new NotFoundException('账单不存在');
    await this.repo.delete(id);
    return { success: true };
  }

  private billTypeLabel(t: string) {
    return { property: '物业费', elevator: '电梯费', parking: '停车费' }[t] || t;
  }

  private financeCategory(t: string) {
    return (
      { property: '物业费收入', elevator: '电梯费收入', parking: '停车费收入' }[
        t
      ] || '其他收入'
    );
  }
}
