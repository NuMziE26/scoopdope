import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ForumsService } from './forums.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { FlagPostDto } from './dto/flag-post.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('v1/forums')
@UseGuards(AuthGuard)
export class ForumsController {
  constructor(private readonly forumsService: ForumsService) {}

  @Get('posts')
  async listPosts() {
    return this.forumsService.listVisiblePosts();
  }

  @Get('posts/:id')
  async getPost(@Param('id') id: string) {
    const post = await this.forumsService.findVisiblePost(id);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  @Post('posts')
  async createPost(@Req() req: any, @Body() dto: CreatePostDto) {
    return this.forumsService.createPost(req.user.id, dto);
  }

  @Post('posts/:id/replies')
  async createReply(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateReplyDto,
  ) {
    return this.forumsService.createReply(req.user.id, id, dto);
  }

  @Post('posts/:id/flag')
  async flagPost(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: FlagPostDto,
  ) {
    return this.forumsService.flagPost(req.user.id, id, dto);
  }

  @Patch('posts/:id/hide')
  async hidePost(@Req() req: any, @Param('id') id: string) {
    this.assertModerator(req.user);
    return this.forumsService.hidePost(id);
  }

  @Delete('posts/:id')
  async deletePost(@Req() req: any, @Param('id') id: string) {
    this.assertModerator(req.user);
    return this.forumsService.deletePost(id);
  }

  private assertModerator(user: any): void {
    const roles: string[] = user?.roles ?? [];
    if (!roles.includes('instructor') && !roles.includes('admin')) {
      throw new ForbiddenException('Moderator access required');
    }
  }
}
