import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FinanceRecord } from './finance.entity';
import {
  CreateFinanceDto,
  UpdateFinanceDto,
  FinanceQueryDto,
} from './dto/finance.dto';
import { JwtUserPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceRecord)
    private readonly repo: Repository<FinanceRecord>,
  ) {}

  async list(q: FinanceQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const qb = this.repo.createQueryBuilder('f');
    if (q.type) qb.andWhere('f.type = :t', { t: q.type });
    if (q.category) qb.andWhere('f.category = :c', { c: q.category });
    if (q.startDate) qb.andWhere('f.recordDate >= :sd', { sd: q.startDate });
    if (q.endDate) qb.andWhere('f.recordDate <= :ed', { ed: q.endDate });
    qb.orderBy('f.recordDate', 'DESC')
      .addOrderBy('f.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async detail(id: number) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('记录不存在');
    return r;
  }

  async create(dto: CreateFinanceDto, user: JwtUserPayload) {
    const r = this.repo.create({
      ...dto,
      recordDate: new Date(dto.recordDate),
      operator: user.realName || user.username,
    });
    return this.repo.save(r);
  }

  async update(id: number, dto: UpdateFinanceDto) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('记录不存在');
    Object.assign(r, dto, {
      recordDate: dto.recordDate ? new Date(dto.recordDate) : r.recordDate,
    });
    return this.repo.save(r);
  }

  async remove(id: number) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('记录不存在');
    await this.repo.delete(id);
    return { success: true };
  }

  /** 报表统计：时间段内收支汇总 + 按分类 + 按月 */
  async report(startDate?: string, endDate?: string) {
    const qb = this.repo.createQueryBuilder('f');
    if (startDate) qb.andWhere('f.recordDate >= :sd', { sd: startDate });
    if (endDate) qb.andWhere('f.recordDate <= :ed', { ed: endDate });

    const income = await qb
      .clone()
      .andWhere('f.type = :t', { t: 'income' })
      .select('COALESCE(SUM(f.amount),0)', 'total')
      .getRawOne();
    const expense = await qb
      .clone()
      .andWhere('f.type = :t', { t: 'expense' })
      .select('COALESCE(SUM(f.amount),0)', 'total')
      .getRawOne();

    const byCategory = await this.repo
      .createQueryBuilder('f')
      .select('f.type', 'type')
      .addSelect('f.category', 'category')
      .addSelect('COALESCE(SUM(f.amount),0)', 'amount')
      .addSelect('COUNT(*)', 'count')
      .groupBy('f.type')
      .addGroupBy('f.category')
      .orderBy('f.type', 'ASC')
      .addOrderBy('amount', 'DESC')
      .getRawMany();

    // 按月汇总
    const monthlyQb = this.repo
      .createQueryBuilder('f')
      .select("strftime('%Y-%m', f.recordDate)", 'month');
    // 注意：SQLite 用 strftime，MySQL 用 DATE_FORMAT。这里用兼容写法
    let byMonth: any[];
    const dbType = (process.env.DB_TYPE || 'sqlite') as string;
    if (dbType === 'mysql') {
      byMonth = await this.repo
        .createQueryBuilder('f')
        .select("DATE_FORMAT(f.recordDate, '%Y-%m')", 'month')
        .addSelect(
          "COALESCE(SUM(CASE WHEN f.type='income' THEN f.amount ELSE 0 END),0)",
          'income',
        )
        .addSelect(
          "COALESCE(SUM(CASE WHEN f.type='expense' THEN f.amount ELSE 0 END),0)",
          'expense',
        )
        .groupBy("DATE_FORMAT(f.recordDate, '%Y-%m')")
        .orderBy('month', 'DESC')
        .limit(12)
        .getRawMany();
    } else {
      byMonth = await this.repo
        .createQueryBuilder('f')
        .select("strftime('%Y-%m', f.recordDate)", 'month')
        .addSelect(
          "COALESCE(SUM(CASE WHEN f.type='income' THEN f.amount ELSE 0 END),0)",
          'income',
        )
        .addSelect(
          "COALESCE(SUM(CASE WHEN f.type='expense' THEN f.amount ELSE 0 END),0)",
          'expense',
        )
        .groupBy("strftime('%Y-%m', f.recordDate)")
        .orderBy('month', 'DESC')
        .limit(12)
        .getRawMany();
    }

    return {
      totalIncome: Number(income.total),
      totalExpense: Number(expense.total),
      netIncome: Number((Number(income.total) - Number(expense.total)).toFixed(2)),
      byCategory,
      byMonth,
    };
  }
}
