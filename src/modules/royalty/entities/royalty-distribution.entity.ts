import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RoyaltyDistributionStatus {
  PENDING = 'pending',
  DISTRIBUTED = 'distributed',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

@Entity('royalty_distributions')
@Index(['creatorId', 'periodStart', 'periodEnd'], { unique: true })
export class RoyaltyDistribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd: Date;

  @Column({ name: 'amount', type: 'numeric', precision: 20, scale: 7, default: '0' })
  amount: string;

  @Column({ name: 'asset_code', type: 'varchar', length: 12, default: 'XLM' })
  assetCode: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: RoyaltyDistributionStatus,
    default: RoyaltyDistributionStatus.PENDING,
  })
  status: RoyaltyDistributionStatus;

  @Index()
  @Column({ name: 'stellar_address', type: 'varchar', length: 56, nullable: true })
  stellarAddress: string | null;

  @Index()
  @Column({ name: 'transaction_hash', type: 'varchar', length: 64, nullable: true })
  transactionHash: string | null;

  @Column({ name: 'skip_reason', type: 'varchar', length: 255, nullable: true })
  skipReason: string | null;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
