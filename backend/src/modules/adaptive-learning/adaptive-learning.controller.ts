import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AdaptiveLearningService } from './adaptive-learning.service';
import { AnalyticsService } from '../analytics/analytics.service';

export interface CourseRecommendation {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  tags: string[];
  score: number;
}

@Controller('v1/courses')
export class AdaptiveLearningController {
  constructor(
    private readonly adaptiveLearningService: AdaptiveLearningService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get(':id/recommendations')
  async getRecommendations(
    @Param('id') courseId: string,
    @Query('learnerId') learnerId?: string,
  ): Promise<{ recommendations: CourseRecommendation[] }> {
    if (!courseId) {
      throw new BadRequestException('Course id is required');
    }

    const currentCourse = await this.adaptiveLearningService.getCourse(courseId);
    if (!currentCourse) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }

    const completedCourseIds = learnerId
      ? await this.adaptiveLearningService.getCompletedCourseIds(learnerId)
      : [];

    const recommendations = await this.adaptiveLearningService.recommendCourses({
      currentCourse,
      learnerId,
      completedCourseIds,
      limit: 5,
    });

    return { recommendations };
  }

  @Post(':id/recommendations/:recommendedId/click')
  async trackRecommendationClick(
    @Param('id') courseId: string,
    @Param('recommendedId') recommendedId: string,
    @Body() body: { learnerId?: string },
  ): Promise<{ recorded: boolean }> {
    if (!courseId || !recommendedId) {
      throw new BadRequestException('Course id and recommended id are required');
    }

    await this.analyticsService.recordEvent({
      event: 'recommendation_click',
      sourceCourseId: courseId,
      recommendedCourseId: recommendedId,
      learnerId: body?.learnerId,
      timestamp: new Date().toISOString(),
    });

    return { recorded: true };
  }
}
