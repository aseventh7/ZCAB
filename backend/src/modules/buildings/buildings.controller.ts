import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto, UpdateBuildingDto } from './dto/building.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('楼栋管理')
@ApiBearerAuth()
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  @ApiOperation({ summary: '楼栋列表' })
  list() {
    return this.buildingsService.list();
  }

  @Get(':buildingNo')
  @ApiOperation({ summary: '楼栋详情' })
  detail(@Param('buildingNo', ParseIntPipe) buildingNo: number) {
    return this.buildingsService.detail(buildingNo);
  }

  @Roles('super_admin', 'admin')
  @Post()
  @ApiOperation({ summary: '新增楼栋' })
  create(@Body() dto: CreateBuildingDto) {
    return this.buildingsService.create(dto);
  }

  @Roles('super_admin', 'admin')
  @Put(':buildingNo')
  @ApiOperation({ summary: '修改楼栋' })
  update(
    @Param('buildingNo', ParseIntPipe) buildingNo: number,
    @Body() dto: UpdateBuildingDto,
  ) {
    return this.buildingsService.update(buildingNo, dto);
  }

  @Roles('super_admin')
  @Delete(':buildingNo')
  @ApiOperation({ summary: '删除楼栋（同时删除其所有房间）' })
  remove(@Param('buildingNo', ParseIntPipe) buildingNo: number) {
    return this.buildingsService.remove(buildingNo);
  }

  @Roles('super_admin', 'admin')
  @Post(':buildingNo/generate-rooms')
  @ApiOperation({ summary: '根据楼栋配置生成房间（幂等）' })
  generateRooms(@Param('buildingNo', ParseIntPipe) buildingNo: number) {
    return this.buildingsService.generateRooms(buildingNo);
  }

  @Roles('super_admin', 'admin')
  @Post('generate-all-rooms')
  @ApiOperation({ summary: '一键生成所有楼栋房间' })
  generateAllRooms() {
    return this.buildingsService.generateAllRooms();
  }
}
