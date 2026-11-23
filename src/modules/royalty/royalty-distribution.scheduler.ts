import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoyaltyDistribution } from './entities/royalty-distribution.entity';
import { Creator } from '../creators/entities/creator.entity';
import { RevenueService } from '../revenue/revenue.service';
import { RoyaltyContractService } from './royalty-contract.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
 export class RoyaltyDistributionScheduler {
  private readonly logger = new Logger(RoyaltyDistributionScheduler.name);

  constructor(
    @InjectRepository(RoyaltyDistribution)
    private readonly distributionRepo: Repository<RoyaltyDistribution>,
    @InjectRepository(Creator)
    private readonly creatorRepo: Repository<Creator>,
    private readonly revenueService: RevenueService,
    private readonly royaltyContractService: RoyaltyContractService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlyDistribution(): Promise<void> {
    const period = this.getPreviousMonthPeriod();
    this.logger.log(`Starting royalty distribution for period ${period.start} - ${period.end}`);

    const creators = await this.creatorRepo.find();
    for (const creator of creators) {
      try {
        await this.distributeForCreator(creator, period);
      } catch (error) {
        this.logger.error(
          `Royalty distribution failed for creator ${creator.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  private async distributeForCreator(
    creator: Creator,
    period: { start: Date; end: Date },
  ): Promise<void> {
    if (!creator.stellarAddress) {
      this.logger.warn(`Skipping creator ${creator.id}: no registered Stellar address`);
      await this.distributionRepo.save(
        this.distributionRepo.create({
          creatorId: creator.id,
          periodStart: period.start,
          periodEnd: period.end,
          amount: '0',
          status: 'skipped',
          reason: 'missing_stellar_address',
        }),
      );
      return;
    }

    const revenue = await this.revenueService.getCreatorRevenue(creator.id, period.start, period.end);
    if (!revenue || revenue.amount <= 0) {
      this.logger.log(`No revenue for creator ${creator.id} in period; skipping`);
      return;
    }

    const txHash = await this.royaltyContractService.distribute(
      creator.stellarAddress,
      revenue.amount,
    );

    await this.distributionRepo.save(
      this.distributionRepo.create({
        creatorId: creator.id,
        periodStart: period.start,
        periodEnd: period.end,
        amount: revenue.amount.toString(),
        transactionHash: txHash,
        status: 'distributed',
      }),
    );

    await this.notificationsService.notifyRoyaltyPayment(creator.id, {
      amount: revenue.amount.toString(),
      transactionHash: txHash,
      periodStart: period.start,
      periodEnd: period.end,
    });

    this.logger.log(`Distributed royalty to creator ${creator.id}: ${revenue.amount} (tx ${txHash})`);
  }

  private getPreviousMonthPeriod(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start, end };
  }
}
