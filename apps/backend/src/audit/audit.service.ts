import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditEntry {
  id: string;
  actor: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  timestamp: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface LogOptions {
  resourceType?: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  page?: number;
  limit?: number;
}

export interface PaginatedAuditLogs {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(
    action: string,
    userId: string,
    success: boolean,
    options: LogOptions = {},
  ): Promise<AuditLog> {
    const entry = this.auditLogRepository.create({
      actor: userId,
      action,
      success,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      changes: options.changes,
      metadata: options.metadata,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      timestamp: new Date(),
    });

    const saved = await this.auditLogRepository.save(entry);

    this.logger.log(
      `audit: ${saved.actor} ${saved.action}` +
        (saved.resourceType ? ` ${saved.resourceType}` : '') +
        (saved.resourceId ? `#${saved.resourceId}` : '') +
        (saved.ipAddress ? ` from ${saved.ipAddress}` : '') +
        (success ? '' : ' (failed)'),
    );

    return saved;
  }

  async getLogs(filters: AuditLogFilters = {}): Promise<PaginatedAuditLogs> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

    const where: FindOptionsWhere<AuditLog> = {};

    if (filters.userId) {
      where.actor = filters.userId;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }
    if (filters.resourceId) {
      where.resourceId = filters.resourceId;
    }

    const startDate = filters.startDate ? new Date(filters.startDate) : undefined;
    const endDate = filters.endDate ? new Date(filters.endDate) : undefined;

    if (startDate && endDate) {
      where.timestamp = Between(startDate, endDate);
    } else if (startDate) {
      where.timestamp = MoreThanOrEqual(startDate);
    } else if (endDate) {
      where.timestamp = LessThanOrEqual(endDate);
    }

    const [data, total] = await this.auditLogRepository.findAndCount({
      where,
      order: { timestamp: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLogsForUser(userId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { actor: userId },
      order: { timestamp: 'DESC' },
    });
  }
}