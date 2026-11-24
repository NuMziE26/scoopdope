import {
  Controller,
  Get,
  Req,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ForumsService } from '../forums/forums.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('v1/admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly forumsService: ForumsService) {}

  @Get('moderation-queue')
  async getModerationQueue(@Req() req: any) {
    const roles: string[] = req.user?.roles ?? [];
    if (!roles.includes('instructor') && !roles.includes('admin')) {
      throw new ForbiddenException('Moderator access required');
    }
    return this.forumsService.listFlaggedPosts();
  }
}
