import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { AnalyticsService } from '../analytics/analytics.service';

export interface CourseRecommendation {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  tags: string[];
  score: number;
}

const MAX_RECOMMENDATIONS = 5;

const DIFFICULTY_ORDER: Record<string, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  expert: 3,
};

@Injectable()
export class AdaptiveLearningService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async getRecommendations(
    courseId: string,
    learnerId: string,
  ): Promise<CourseRecommendation[]> {
    const currentCourse = await this.courseRepository.findOne({
      where: { id: courseId },
    });
    if (!currentCourse) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }

    const enrollments = await this.enrollmentRepository.find({
      where: { learnerId },
    });

    const completedCourseIds = new Set(
      enrollments
        .filter((enrollment) => enrollment.status === 'completed')
        .map((enrollment) => enrollment.courseId),
    );
    completedCourseIds.add(courseId);

    const candidates = await this.courseRepository.find({
      where: { category: currentCourse.category },
    });

    const currentTags = new Set(currentCourse.tags ?? []);
    const currentDifficulty = DIFFICULTY_ORDER[currentCourse.difficulty] ?? 0;

    const ranked = candidates
      .filter((course) => !completedCourseIds.has(course.id))
      .map((course) => {
        const sharedTags = (course.tags ?? []).filter((tag) =>
          currentTags.has(tag),
        ).length;
        const difficulty = DIFFICULTY_ORDER[course.difficulty] ?? 0;
        const difficultyProximity = -Math.abs(difficulty - currentDifficulty);
        const score = sharedTags * 2 + difficultyProximity;
        return {
          id: course.id,
          title: course.title,
          category: course.category,
          difficulty: course.difficulty,
          tags: course.tags ?? [],
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS);

    return ranked;
  }

  async trackRecommendationClick(
    courseId: string,
    recommendedCourseId: string,
    learnerId: string,
  ): Promise<void> {
    await this.analyticsService.recordEvent({
      eventType: 'recommendation_click',
      learnerId,
      properties: {
        sourceCourseId: courseId,
        recommendedCourseId,
      },
    });
  }
}
