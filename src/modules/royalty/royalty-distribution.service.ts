import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Minimal shape of a creator record as needed for royalty distribution.
 * The concrete persistence layer is injected via the repository port below.
 */
export interface CreatorRoyaltyRecord {
  creatorId: string;
  stellarAddress?: string | null;
  revenueShareBps: number;
}

export interface RoyaltyDistributionRecord {
  creatorId: string;
  period: string;
  amount: string;
  transactionHash: string;
  distributedAt: Date;
}

/**
 * Ports the service depends on. Implementations are provided by the module
 * (DB-backed repository, Soroban contract client, notification service).
 */
export interface RoyaltyRepository {
  listEligibleCreators(periodStart: Date, periodEnd: Date): Promise<CreatorRoyaltyRecord[]>;
  getPeriodRevenue(periodStart: Date, periodEnd: Date): Promise<bigint>;
  saveDistribution(record: RoyaltyDistributionRecord): Promise<void>;
  flagCreatorMissingAddress(creatorId: string, period: string): Promise<void>;
  findDistributionsByCreator(creatorId: string): Promise<RoyaltyDistributionRecord[]>;
}

export interface RoyaltyContractClient {
  distribute(creatorStellarAddress: string, amount: bigint): Promise<{ transactionHash: string }>;
}

export interface RoyaltyNotifier {
  notifyRoyaltyPaid(creatorId: string, amount: bigint, transactionHash: string): Promise<void>;
}

@Injectable()
export class RoyaltyDistributionService {
  private readonly logger = new Logger(RoyaltyDistributionService.name);

  constructor(
    private readonly repository: RoyaltyRepository,
    private readonly contractClient: RoyaltyContractClient,
    private readonly notifier: RoyaltyNotifier,
  ) {}

  /**
   * Runs on the first day of every month and distributes royalties for the
   * previous calendar month.
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async runMonthlyDistribution(): Promise<void> {
    const { periodStart, periodEnd } = this.previousMonthRange(new Date());
    await this.distributeForPeriod(periodStart, periodEnd);
  }

  /**
   * Distributes royalties for the given period. Exposed so it can be triggered
   * manually or from tests without waiting for the cron schedule.
   */
  async distributeForPeriod(periodStart: Date, periodEnd: Date): Promise<void> {
    const period = this.periodLabel(periodStart);
    const totalRevenue = await this.repository.getPeriodRevenue(periodStart, periodEnd);

    if (totalRevenue <= 0n) {
      this.logger.log(`No revenue for period ${period}; skipping royalty distribution.`);
      return;
    }

    const creators = await this.repository.listEligibleCreators(periodStart, periodEnd);

    for (const creator of creators) {
      if (!creator.stellarAddress) {
        this.logger.warn(
          `Creator ${creator.creatorId} has no registered Stellar address; skipping and flagging.`,
        );
        await this.repository.flagCreatorMissingAddress(creator.creatorId, period);
        continue;
      }

      const amount = (totalRevenue * BigInt(creator.revenueShareBps)) / 10_000n;
      if (amount <= 0n) {
        continue;
      }

      try {
        const { transactionHash } = await this.contractClient.distribute(
          creator.stellarAddress,
          amount,
        );

        await this.repository.saveDistribution({
          creatorId: creator.creatorId,
          period,
          amount: amount.toString(),
          transactionHash,
          distributedAt: new Date(),
        });

        await this.notifier.notifyRoyaltyPaid(creator.creatorId, amount, transactionHash);
      } catch (error) {
        this.logger.error(
          `Failed to distribute royalties to creator ${creator.creatorId} for ${period}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  /** Returns stored distribution records for a creator, including tx hashes. */
  async getDistributionsForCreator(creatorId: string): Promise<RoyaltyDistributionRecord[]> {
    return this.repository.findDistributionsByCreator(creatorId);
  }

  private previousMonthRange(now: Date): { periodStart: Date; periodEnd: Date } {
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { periodStart, periodEnd };
  }

  private periodLabel(periodStart: Date): string {
    const year = periodStart.getUTCFullYear();
    const month = String(periodStart.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
