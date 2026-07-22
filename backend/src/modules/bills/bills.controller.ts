import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillsService } from './bills.service';
import {
  GenerateBillsDto,
  PayBillDto,
  BatchPayDto,
  BillQueryDto,
  PrintNoticeDto,
} from './dto/bill.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('物业费账单')
@ApiBearerAuth()
@Controller('bills')
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Get()
  @ApiOperation({ summary: '账单列表（筛选/分页）' })
  list(@Query() q: BillQueryDto) {
    return this.billsService.list(q);
  }

  @Get('statistics')
  @ApiOperation({ summary: '账单统计（可按周期）' })
  statistics(@Query('period') period?: string) {
    return this.billsService.statistics(period);
  }

  @Get('owner/:ownerId')
  @ApiOperation({ summary: '某业主的历史账单' })
  ownerBills(@Param('ownerId', ParseIntPipe) ownerId: number) {
    return this.billsService.ownerBills(ownerId);
  }

  @Get(':id')
  @ApiOperation({ summary: '账单详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.billsService.detail(id);
  }

  @Roles('super_admin', 'admin', 'finance')
  @Post('generate')
  @ApiOperation({ summary: '批量生成账单（物业费/电梯费/停车费）' })
  generate(@Body() dto: GenerateBillsDto) {
    return this.billsService.generate(dto);
  }

  @Roles('super_admin', 'admin', 'finance')
  @Put(':id/pay')
  @ApiOperation({ summary: '单个缴费' })
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayBillDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.billsService.pay(id, dto, user);
  }

  @Roles('super_admin', 'admin', 'finance')
  @Post('batch-pay')
  @ApiOperation({ summary: '批量缴费' })
  batchPay(
    @Body() dto: BatchPayDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.billsService.batchPay(dto, user);
  }

  @Roles('super_admin', 'admin', 'finance')
  @Post('mark-overdue')
  @ApiOperation({ summary: '一键标记逾期账单' })
  markOverdue() {
    return this.billsService.markOverdue();
  }

  @Post('notice')
  @ApiOperation({ summary: '生成催缴通知单数据（批量/单个打印用）' })
  notice(@Body() dto: PrintNoticeDto) {
    return this.billsService.noticeData(dto);
  }

  @Roles('super_admin', 'admin')
  @Delete(':id')
  @ApiOperation({ summary: '删除账单' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.billsService.remove(id);
  }
}
