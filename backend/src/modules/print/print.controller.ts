import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrintService } from './print.service';

@ApiTags('打印（催缴单/收据）')
@ApiBearerAuth()
@Controller('print')
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Post('notice')
  @ApiOperation({ summary: '催缴通知单（HTML，浏览器直接打印）' })
  async notice(
    @Body('billIds') billIds: number[],
    @Res() res: Response,
  ) {
    const html = await this.printService.noticeHtml(billIds || []);
    res.type('text/html').send(html);
  }

  @Get('receipt/:id')
  @ApiOperation({ summary: '单个缴费收据（HTML）' })
  async receipt(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const html = await this.printService.receiptHtml(id);
    res.type('text/html').send(html);
  }

  @Post('receipts')
  @ApiOperation({ summary: '批量缴费收据（HTML）' })
  async receipts(
    @Body('billIds') billIds: number[],
    @Res() res: Response,
  ) {
    const html = await this.printService.receiptsHtml(billIds || []);
    res.type('text/html').send(html);
  }
}
