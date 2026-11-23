import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GrantsService } from './grants.service';
import { CreateGrantApplicationDto } from './dto/create-grant-application.dto';
import { ReviewGrantApplicationDto } from './dto/review-grant-application.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('v1/grants')
@UseGuards(JwtAuthGuard)
export class GrantsController {
  constructor(private readonly grantsService: GrantsService) {}

  @Get()
  listOpenGrants() {
    return this.grantsService.listOpenGrants();
  }

  @Get('applications/me')
  listMyApplications(@Req() req: any) {
    return this.grantsService.listApplicationsForUser(req.user.id);
  }

  @Post('apply')
  apply(@Req() req: any, @Body() dto: CreateGrantApplicationDto) {
    return this.grantsService.apply(req.user.id, dto);
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  review(@Param('id') id: string, @Body() dto: ReviewGrantApplicationDto) {
    return this.grantsService.review(id, dto);
  }
}
