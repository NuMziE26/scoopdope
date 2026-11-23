import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { LiveSessionsService } from './live-sessions.service';
import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { UpdateLiveSessionDto } from './dto/update-live-session.dto';
import { buildLiveSessionIcs } from './live-session-ics.util';

@Controller('v1/live-sessions')
export class LiveSessionsController {
  constructor(private readonly liveSessionsService: LiveSessionsService) {}

  @Get()
  findAll(@Query('courseId') courseId?: string) {
    return this.liveSessionsService.findAll(courseId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.liveSessionsService.findOne(id);
  }

  @Get(':id/calendar')
  async getCalendar(@Param('id') id: string, @Res() res: Response) {
    const session = await this.liveSessionsService.findOne(id);
    if (!session) {
      throw new NotFoundException(`Live session ${id} not found`);
    }

    const ics = buildLiveSessionIcs(session);
    const filename = `live-session-${session.id}.ics`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ics);
  }

  @Post()
  create(@Body() dto: CreateLiveSessionDto) {
    return this.liveSessionsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLiveSessionDto) {
    return this.liveSessionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.liveSessionsService.remove(id);
  }
}
