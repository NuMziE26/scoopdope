import { Controller, Get, Param, Version } from '@nestjs/common';
import { CoursesService } from './courses.service';

@Controller('courses')
@Version('1')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  findAll() {
    return this.coursesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }
}
