import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';

@ApiTags('房间管理/楼宇预览')
@ApiBearerAuth()
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('overview')
  @ApiOperation({ summary: '楼宇预览平面图（7栋楼每户状态聚合）' })
  overview() {
    return this.roomsService.overview();
  }

  @Get('statistics')
  @ApiOperation({ summary: '房间统计' })
  statistics() {
    return this.roomsService.statistics();
  }

  @Get()
  @ApiOperation({ summary: '房间列表（分页/筛选）' })
  list(
    @Query('buildingNo') buildingNo?: string,
    @Query('unitNo') unitNo?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.roomsService.list({
      buildingNo: buildingNo ? parseInt(buildingNo, 10) : undefined,
      unitNo: unitNo ? parseInt(unitNo, 10) : undefined,
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 200,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '房间详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.detail(id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: '修改房间状态' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.roomsService.updateStatus(id, status);
  }

  @Put(':id/area')
  @ApiOperation({ summary: '修改房间面积' })
  updateArea(
    @Param('id', ParseIntPipe) id: number,
    @Body('area') area: number,
  ) {
    return this.roomsService.updateArea(id, area);
  }
}
