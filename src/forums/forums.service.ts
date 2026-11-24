import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForumPost } from './entities/forum-post.entity';
import { ForumReply } from './entities/forum-reply.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { MailService } from '../mail/mail.service';
import { UserRole } from '../users/entities/user.entity';

export interface ForumActor {
  id: string;
  role: UserRole;
  email?: string;
}

@Injectable()
export class ForumsService {
  constructor(
    @InjectRepository(ForumPost)
    private readonly postRepository: Repository<ForumPost>,
    @InjectRepository(ForumReply)
    private readonly replyRepository: Repository<ForumReply>,
    private readonly mailService: MailService,
  ) {}

  private isModerator(actor: ForumActor): boolean {
    return actor.role === UserRole.INSTRUCTOR || actor.role === UserRole.ADMIN;
  }

  private assertModerator(actor: ForumActor): void {
    if (!this.isModerator(actor)) {
      throw new ForbiddenException('Only moderators can perform this action');
    }
  }

  async createPost(dto: CreatePostDto, authorId: string): Promise<ForumPost> {
    const post = this.postRepository.create({
      ...dto,
      authorId,
      hidden: false,
      flagged: false,
    });
    return this.postRepository.save(post);
  }

  async createReply(dto: CreateReplyDto, authorId: string): Promise<ForumReply> {
    const reply = this.replyRepository.create({
      ...dto,
      authorId,
      hidden: false,
      flagged: false,
    });
    return this.replyRepository.save(reply);
  }

  async findVisiblePosts(): Promise<ForumPost[]> {
    return this.postRepository.find({
      where: { hidden: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findPostById(id: string): Promise<ForumPost> {
    const post = await this.postRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  async hidePost(id: string, actor: ForumActor): Promise<ForumPost> {
    this.assertModerator(actor);
    const post = await this.findPostById(id);
    if (post.hidden) {
      return post;
    }
    post.hidden = true;
    const saved = await this.postRepository.save(post);
    await this.notifyAuthorHidden(saved);
    return saved;
  }

  async deletePost(id: string, actor: ForumActor): Promise<void> {
    this.assertModerator(actor);
    const post = await this.findPostById(id);
    await this.postRepository.remove(post);
  }

  async flagPost(id: string, actor: ForumActor, reason?: string): Promise<ForumPost> {
    const post = await this.findPostById(id);
    if (post.flagged) {
      return post;
    }
    post.flagged = true;
    post.flagReason = reason ?? null;
    post.flaggedById = actor.id;
    return this.postRepository.save(post);
  }

  async getModerationQueue(actor: ForumActor): Promise<ForumPost[]> {
    this.assertModerator(actor);
    return this.postRepository.find({
      where: { flagged: true },
      order: { updatedAt: 'DESC' },
    });
  }

  private async notifyAuthorHidden(post: ForumPost): Promise<void> {
    if (!post.author?.email) {
      return;
    }
    try {
      await this.mailService.sendForumPostHiddenEmail(post.author.email, post);
    } catch (error) {
      // Do not fail moderation if the notification email cannot be sent.
    }
  }
}
