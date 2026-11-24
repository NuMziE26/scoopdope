import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('forum_posts')
export class ForumPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  threadId: string;

  @Column({ type: 'uuid' })
  @Index()
  authorId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'boolean', default: false })
  isHidden: boolean;

  @Column({ type: 'uuid', nullable: true })
  hiddenById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  @Column({ type: 'boolean', default: false })
  @Index()
  isFlagged: boolean;

  @Column({ type: 'uuid', nullable: true })
  flaggedById: string | null;

  @Column({ type: 'text', nullable: true })
  flagReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  flaggedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
