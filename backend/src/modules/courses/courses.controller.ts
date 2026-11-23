import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CoursesService } from './courses.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Course } from './entities/course.entity';

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

const MAX_RECOMMENDATIONS = 5;

@Controller('v1/courses')
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Course> {
    const course = await this.coursesService.findById(id);
    if (!course) {
      throw new NotFoundException(`Course ${id} not found`);
    }
    return course;
  }

  @Get(':id/recommendations')
  @UseGuards(JwtAuthGuard)
  async getRecommendations(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Course[]> {
    const course = await this.coursesService.findById(id);
    if (!course) {
      throw new NotFoundException(`Course ${id} not found`);
    }

    const learnerId = req.user?.id;
    const completedCourseIds = learnerId
      ? await this.coursesService.findCompletedCourseIds(learnerId)
      : [];

    const candidates = await this.coursesService.findByCategory(course.category);

    const ranked = candidates
      .filter((candidate) => candidate.id !== course.id)
      .filter((candidate) => !completedCourseIds.includes(candidate.id))
      .map((candidate) => ({
        course: candidate,
        score: this.scoreRecommendation(course, candidate),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS)
      .map((entry) => entry.course);

    return ranked;
  }

  @Get(':id/recommendations/:recommendedId/click')
  @UseGuards(JwtAuthGuard)
  async trackRecommendationClick(
    @Param('id') id: string,
    @Param('recommendedId') recommendedId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ recorded: boolean }> {
    await this.analyticsService.trackEvent({
      event: 'recommendation_click',
      userId: req.user?.id,
      properties: {
        sourceCourseId: id,
        recommendedCourseId: recommendedId,
      },
    });
    return { recorded: true };
  }

  private scoreRecommendation(current: Course, candidate: Course): number {
    let score = 0;

    const currentTags = new Set(current.tags ?? []);
    const sharedTags = (candidate.tags ?? []).filter((tag) => currentTags.has(tag));
    score += sharedTags.length * 10;

    const difficultyOrder = ['beginner', 'intermediate', 'advanced'];
    const currentRank = difficultyOrder.indexOf(current.difficulty);
    const candidateRank = difficultyOrder.indexOf(candidate.difficulty);
    if (currentRank >= 0 && candidateRank >= 0) {
      if (candidateRank === currentRank + 1) {
        score += 5;
      } else if (candidateRank === currentRank) {
        score += 3;
      } else if (candidateRank < currentRank) {
        score += 1;
      }
    }

    return score;
  }
}
