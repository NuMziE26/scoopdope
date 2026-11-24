import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Check,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Course } from './course.entity';

/**
 * Join table that tracks which instructors are assigned to which courses.
 * A course can have multiple assigned instructors (m:n with audit info).
 */
@Entity('course_instructors')
@Unique(['courseId', 'instructorId'])
// Why: revenue share is a percentage and must stay within 0-100.
@Check('"revenue_share_percent" >= 0 AND "revenue_share_percent" <= 100')
export class CourseInstructor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  courseId: string;

  // Why: if a course is deleted, remove all instructor assignments for it.
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @Column()
  instructorId: string;

  // Why: if a user is deleted, remove their instructor assignments.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instructorId' })
  instructor: User;

  // Why: per-assignment revenue share (0-100) so splits can be renegotiated
  // per instructor/course without a code change. Defaults to 70%.
  @Column({ name: 'revenue_share_percent', type: 'int', default: 70 })
  revenueSharePercent: number;

  @CreateDateColumn()
  assignedAt: Date;
}