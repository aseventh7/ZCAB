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
import { ParkingService } from './parking.service';
import {
  CreateParkingDto,
  UpdateParkingDto,
  BindOwnerDto,
  ParkingQueryDto,
} from './dto/parking.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('车位管理')
@ApiBearerAuth()
@Controller('parking')
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Get()
  @ApiOperation({ summary: '车位列表（筛选/分页）' })
  list(@Query() q: ParkingQueryDto) {
    return this.parkingService.list(q);
  }

  @Get('statistics')
  @ApiOperation({ summary: '车位统计' })
  statistics() {
    return this.parkingService.statistics();
  }

  @Get(':id')
  @ApiOperation({ summary: '车位详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.parkingService.detail(id);
  }

  @Roles('super_admin', 'admin')
  @Post()
  @ApiOperation({ summary: '新增车位' })
  create(@Body() dto: CreateParkingDto) {
    return this.parkingService.create(dto);
  }

  @Roles('super_admin', 'admin')
  @Post('batch')
  @ApiOperation({ summary: '批量新增车位' })
  batchCreate(
    @Body('codes') codes: string[],
    @Body('type') type?: string,
    @Body('price') price?: number,
  ) {
    return this.parkingService.batchCreate(codes || [], type, price);
  }

  @Roles('super_admin', 'admin')
  @Put(':id')
  @ApiOperation({ summary: '修改车位' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateParkingDto,
  ) {
    return this.parkingService.update(id, dto);
  }

  @Roles('super_admin', 'admin')
  @Put(':id/bind')
  @ApiOperation({ summary: '绑定业主' })
  bindOwner(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BindOwnerDto,
  ) {
    return this.parkingService.bindOwner(id, dto);
  }

  @Roles('super_admin', 'admin')
  @Put(':id/unbind')
  @ApiOperation({ summary: '解绑业主' })
  unbindOwner(@Param('id', ParseIntPipe) id: number) {
    return this.parkingService.unbindOwner(id);
  }

  @Roles('super_admin', 'admin')
  @Delete(':id')
  @ApiOperation({ summary: '删除车位' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.parkingService.remove(id);
  }
}
