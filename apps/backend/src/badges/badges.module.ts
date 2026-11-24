import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadgesController } from './badges.controller';
import { BadgesService } from './badges.service';
import { BadgesEventListener } from './badges-event.listener';
import { Badge } from './badge.entity';
import { UserBadge } from './user-badge.entity';
import { User } from '../users/user.entity';
import { Progress } from '../progress/progress.entity';
import { Reply } from '../forums/reply.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { Course } from '../courses/course.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Badge,
      UserBadge,
      User,
      Progress,
      Reply,
      Enrollment,
      Course,
    ]),
  ],
  controllers: [BadgesController],
  providers: [BadgesService, BadgesEventListener],
  exports: [BadgesService],
})
export class BadgesModule {}