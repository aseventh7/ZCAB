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
import { OwnersService } from './owners.service';
import { CreateOwnerDto, UpdateOwnerDto, OwnerQueryDto } from './dto/owner.dto';

@ApiTags('业主信息')
@ApiBearerAuth()
@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  @ApiOperation({ summary: '业主列表（支持关键字/楼栋/状态筛选）' })
  list(@Query() q: OwnerQueryDto) {
    return this.ownersService.list(q);
  }

  @Get('statistics')
  @ApiOperation({ summary: '业主统计' })
  statistics() {
    return this.ownersService.statistics();
  }

  @Get(':id')
  @ApiOperation({ summary: '业主详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.ownersService.detail(id);
  }

  @Post()
  @ApiOperation({ summary: '新增业主（一户一档）' })
  create(@Body() dto: CreateOwnerDto) {
    return this.ownersService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '修改业主' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOwnerDto) {
    return this.ownersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除业主（房间恢复空置）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ownersService.remove(id);
  }
}
