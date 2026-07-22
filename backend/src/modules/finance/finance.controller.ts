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
import { FinanceService } from './finance.service';
import {
  CreateFinanceDto,
  UpdateFinanceDto,
  FinanceQueryDto,
} from './dto/finance.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('财务收支')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  @ApiOperation({ summary: '收支记录列表（筛选/分页）' })
  list(@Query() q: FinanceQueryDto) {
    return this.financeService.list(q);
  }

  @Get('report')
  @ApiOperation({ summary: '财务报表（收支汇总/分类/月度）' })
  report(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.financeService.report(startDate, endDate);
  }

  @Get(':id')
  @ApiOperation({ summary: '收支记录详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.detail(id);
  }

  @Roles('super_admin', 'admin', 'finance')
  @Post()
  @ApiOperation({ summary: '新增收支记录' })
  create(
    @Body() dto: CreateFinanceDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.financeService.create(dto, user);
  }

  @Roles('super_admin', 'admin', 'finance')
  @Put(':id')
  @ApiOperation({ summary: '修改收支记录' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFinanceDto,
  ) {
    return this.financeService.update(id, dto);
  }

  @Roles('super_admin', 'finance')
  @Delete(':id')
  @ApiOperation({ summary: '删除收支记录' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.remove(id);
  }
}
