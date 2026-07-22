import { Injectable } from '@nestjs/common';
import { BillsService } from '../bills/bills.service';

@Injectable()
export class PrintService {
  constructor(private readonly billsService: BillsService) {}

  /** 催缴通知单（HTML，供前端浏览器打印） */
  async noticeHtml(billIds: number[]): Promise<string> {
    const { notices } = await this.billsService.noticeData({ billIds });
    if (notices.length === 0) {
      return '<div style="text-align:center;padding:40px;">未找到欠费账单</div>';
    }
    const pages = notices
      .map((n: any, idx: number) => this.renderNoticePage(n, idx))
      .join('<div class="page-break"></div>');
    return this.wrapHtml('德馨苑小区物业费催缴通知单', pages, true);
  }

  /** 单个账单缴费收据（HTML） */
  async receiptHtml(billId: number): Promise<string> {
    const bill: any = await this.billsService.detail(billId);
    const html = this.renderReceipt(bill);
    return this.wrapHtml('德馨苑物业缴费收据', html, false);
  }

  /** 批量缴费收据 */
  async receiptsHtml(billIds: number[]): Promise<string> {
    const pages: string[] = [];
    for (const id of billIds) {
      try {
        const bill: any = await this.billsService.detail(id);
        pages.push(this.renderReceipt(bill));
      } catch {
        // skip
      }
    }
    return this.wrapHtml(
      '德馨苑物业缴费收据',
      pages.join('<div class="page-break"></div>'),
      true,
    );
  }

  private wrapHtml(title: string, body: string, landscape: boolean): string {
    const size = landscape ? '@page { size: A4; margin: 12mm; }' : '@page { size: A4; margin: 15mm; }';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  ${size}
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; color: #222; margin: 0; padding: 0; }
  .page { padding: 10px 0; }
  .page-break { page-break-after: always; height: 0; }
  .notice-title { text-align: center; font-size: 22px; font-weight: bold; letter-spacing: 4px; margin-bottom: 6px; }
  .notice-sub { text-align: center; font-size: 13px; color: #666; margin-bottom: 16px; border-bottom: 1px dashed #ccc; padding-bottom: 8px; }
  .notice-meta { font-size: 14px; line-height: 2; margin-bottom: 10px; display: flex; justify-content: space-between; }
  .notice-meta span { display: inline-block; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  table th, table td { border: 1px solid #555; padding: 6px 8px; text-align: center; }
  table th { background: #f0f4f8; }
  .total-row { font-weight: bold; background: #fffbe6; }
  .notice-footer { margin-top: 18px; font-size: 13px; line-height: 1.8; color: #444; }
  .notice-sign { margin-top: 30px; display: flex; justify-content: space-between; font-size: 14px; }
  .notice-stamp { margin-top: 12px; text-align: right; color: #c0392b; font-style: italic; }
  .receipt-box { border: 2px solid #333; padding: 20px; max-width: 700px; margin: 0 auto; }
  .receipt-title { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 14px; }
  .receipt-row { display: flex; justify-content: space-between; font-size: 14px; line-height: 2; border-bottom: 1px dotted #ddd; padding: 2px 0; }
  .receipt-amount { color: #c0392b; font-weight: bold; }
</style>
</head>
<body>
${body}
<script>
  // 自动调用打印（前端也可手动调用 window.print()）
  window.onload = function() { setTimeout(function(){ window.print(); }, 300); };
</script>
</body>
</html>`;
  }

  private renderNoticePage(n: any, idx: number): string {
    const itemsRows = n.items
      .map(
        (it: any) => `
      <tr>
        <td>${it.billTypeLabel}</td>
        <td>${it.period}</td>
        <td>${Number(it.amount).toFixed(2)}</td>
        <td>${Number(it.paidAmount).toFixed(2)}</td>
        <td style="color:#c0392b;font-weight:bold;">${Number(it.unpaid).toFixed(2)}</td>
        <td>${it.dueDate ? new Date(it.dueDate).toISOString().slice(0,10) : '-'}</td>
      </tr>`,
      )
      .join('');
    return `
    <div class="page">
      <div class="notice-title">德馨苑小区物业费催缴通知单</div>
      <div class="notice-sub">尊敬的业主，您好：为保障小区物业服务正常运转，请您尽快结清以下欠费款项</div>
      <div class="notice-meta">
        <span>业主姓名：<b>${n.ownerName}</b></span>
        <span>房&nbsp;&nbsp;号：<b>${n.fullRoomNo}</b></span>
        <span>建筑面积：${Number(n.area).toFixed(2)} ㎡</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>费用项目</th><th>计费周期</th><th>应缴金额(元)</th><th>已缴金额(元)</th><th>欠缴金额(元)</th><th>截止日期</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
          <tr class="total-row">
            <td colspan="2">合计</td>
            <td>${Number(n.totalAmount).toFixed(2)}</td>
            <td>${Number(n.totalPaid).toFixed(2)}</td>
            <td style="color:#c0392b;">${Number(n.totalUnpaid).toFixed(2)}</td>
            <td>-</td>
          </tr>
        </tbody>
      </table>
      <div class="notice-footer">
        缴费方式：请前往德馨苑物业服务中心（小区主入口左侧）现场缴费，或联系物业管家微信缴费。<br>
        联系电话：010-88888000 &nbsp;&nbsp; 服务时间：08:30 - 17:30<br>
        温馨提示：如您已于近期缴费，请忽略本通知单，感谢您的配合与支持！
      </div>
      <div class="notice-sign">
        <span>打印日期：${n.printDate}</span>
        <span>德馨苑物业服务中心（盖章）</span>
      </div>
    </div>`;
  }

  private renderReceipt(bill: any): string {
    const statusLabel: any = {
      unpaid: '未缴',
      partial: '部分缴费',
      paid: '已缴清',
      overdue: '逾期',
    };
    const billTypeLabel: any = {
      property: '物业费',
      elevator: '电梯费',
      parking: '停车费',
    };
    return `
    <div class="page">
      <div class="receipt-box">
        <div class="receipt-title">德馨苑物业缴费收据</div>
        <div class="receipt-row"><span>收据编号：${String(bill.id).padStart(6, '0')}</span><span>日期：${new Date(bill.paidAt || Date.now()).toISOString().slice(0, 10)}</span></div>
        <div class="receipt-row"><span>业主姓名：${bill.ownerName}</span><span>房号：${bill.fullRoomNo}</span></div>
        <div class="receipt-row"><span>费用项目：${billTypeLabel[bill.billType] || bill.billType}</span><span>计费周期：${bill.period}</span></div>
        <div class="receipt-row"><span>建筑面积：${Number(bill.area).toFixed(2)} ㎡</span><span>计费月数：${bill.months} 个月</span></div>
        <div class="receipt-row"><span>单价：${Number(bill.unitPrice).toFixed(2)} 元</span><span>应缴金额：<b>${Number(bill.amount).toFixed(2)}</b> 元</span></div>
        <div class="receipt-row"><span>实缴金额：<span class="receipt-amount">${Number(bill.paidAmount).toFixed(2)} 元</span></span><span>缴费状态：${statusLabel[bill.status] || bill.status}</span></div>
        <div class="receipt-row"><span>收费人：${bill.operator || '-'}</span><span>备注：${bill.remark || '-'}</span></div>
        <div class="receipt-row" style="border-bottom:none;margin-top:20px;">
          <span>本收据盖章有效</span>
          <span>德馨苑物业服务中心</span>
        </div>
      </div>
    </div>`;
  }
}
