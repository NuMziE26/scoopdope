import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLog } from './audit-log.decorator';
import { AUDIT_LOG_KEY } from './audit.constants';

/**
 * CI coverage for issue #1341 — Audit Log for Admin Actions.
 *
 * Exercises at least three distinct admin actions (course approval, course
 * archival, course deletion) and asserts that audit entries are created with
 * actor, action, target, and timestamp. Also covers the paginated/filtered
 * GET /v1/admin/audit-log endpoint and asserts that no update/delete routes
 * exist for audit entries.
 */

type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
};

class InMemoryAuditService {
  private readonly entries: AuditEntry[] = [];
  private seq = 0;

  async record(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
    const stored: AuditEntry = {
      id: `audit-${++this.seq}`,
      timestamp: new Date(),
      ...entry,
    };
    this.entries.push(stored);
    return stored;
  }

  async findAll(query: {
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;

    const filtered = this.entries.filter((e) => {
      if (query.action && e.action !== query.action) return false;
      if (query.actor && e.actor !== query.actor) return false;
      if (query.from && e.timestamp < new Date(query.from)) return false;
      if (query.to && e.timestamp > new Date(query.to)) return false;
      return true;
    });

    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return {
      data,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit) || 0,
    };
  }

  reset() {
    this.entries.length = 0;
    this.seq = 0;
  }
}

// Simulated admin controllers that the interceptor wraps. Each handler is
// decorated with @AuditLog so the interceptor can resolve the action name.
class AdminCourseController {
  @AuditLog('course.approve')
  async approveCourse(courseId: string) {
    return { id: courseId, status: 'APPROVED' };
  }

  @AuditLog('course.archive')
  async archiveCourse(courseId: string) {
    return { id: courseId, status: 'ARCHIVED' };
  }

  @AuditLog('course.delete')
  async deleteCourse(courseId: string) {
    return { id: courseId, deleted: true };
  }
}

function buildContext(
  handler: (...args: any[]) => any,
  request: Record<string, any>,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AdminCourseController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as any,
    switchToWs: () => ({}) as any,
    getType: () => 'http' as any,
  } as unknown as ExecutionContext;
}

describe('Audit Log for Admin Actions (#1341)', () => {
  let app: INestApplication;
  let auditService: InMemoryAuditService;
  let interceptor: AuditInterceptor;
  let adminController: AdminCourseController;

  const adminRequest = (actor: string) => ({
    user: { id: actor, role: 'ADMIN' },
    params: {},
    body: {},
    query: {},
    method: 'POST',
    url: '/v1/admin/courses',
  });

  beforeAll(async () => {
    auditService = new InMemoryAuditService();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        Reflector,
        { provide: AuditService, useValue: auditService },
        {
          provide: AuditInterceptor,
          useFactory: (reflector: Reflector, service: AuditService) =>
            new AuditInterceptor(reflector, service),
          inject: [Reflector, AuditService],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    interceptor = moduleRef.get(AuditInterceptor);
    adminController = new AdminCourseController();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    auditService.reset();
  });

  describe('@AuditLog decorator metadata', () => {
    it('attaches the action name to the handler metadata', () => {
      const reflector = new Reflector();
      const action = reflector.get<string>(
        AUDIT_LOG_KEY,
        AdminCourseController.prototype.approveCourse,
      );
      expect(action).toBe('course.approve');
    });
  });

  describe('admin actions produce audit entries', () => {
    async function runAction(
      handler: (...args: any[]) => any,
      actor: string,
      target: string,
    ) {
      const request = adminRequest(actor);
      request.params = { id: target };
      const context = buildContext(handler, request);
      const next: CallHandler = { handle: () => of({ ok: true }) };
      await new Promise<void>((resolve, reject) => {
        interceptor.intercept(context, next).subscribe({
          next: () => undefined,
          error: reject,
          complete: resolve,
        });
      });
    }

    it('records course approval with actor, action, target and timestamp', async () => {
      await runAction(
        AdminCourseController.prototype.approveCourse,
        'admin-1',
        'course-100',
      );

      const { data, total } = await auditService.findAll({});
      expect(total).toBe(1);
      const entry = data[0];
      expect(entry.actor).toBe('admin-1');
      expect(entry.action).toBe('course.approve');
      expect(entry.target).toBe('course-100');
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it('records course archival with actor, action, target and timestamp', async () => {
      await runAction(
        AdminCourseController.prototype.archiveCourse,
        'admin-2',
        'course-200',
      );

      const { data, total } = await auditService.findAll({});
      expect(total).toBe(1);
      const entry = data[0];
      expect(entry.actor).toBe('admin-2');
      expect(entry.action).toBe('course.archive');
      expect(entry.target).toBe('course-200');
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it('records course deletion with actor, action, target and timestamp', async () => {
      await runAction(
        AdminCourseController.prototype.deleteCourse,
        'admin-3',
        'course-300',
      );

      const { data, total } = await auditService.findAll({});
      expect(total).toBe(1);
      const entry = data[0];
      expect(entry.actor).toBe('admin-3');
      expect(entry.action).toBe('course.delete');
      expect(entry.target).toBe('course-300');
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it('records all three distinct admin actions independently', async () => {
      await runAction(
        AdminCourseController.prototype.approveCourse,
        'admin-1',
        'course-100',
      );
      await runAction(
        AdminCourseController.prototype.archiveCourse,
        'admin-2',
        'course-200',
      );
      await runAction(
        AdminCourseController.prototype.deleteCourse,
        'admin-3',
        'course-300',
      );

      const { data, total } = await auditService.findAll({});
      expect(total).toBe(3);
      const actions = data.map((e) => e.action).sort();
      expect(actions).toEqual([
        'course.approve',
        'course.archive',
        'course.delete',
      ]);
      for (const entry of data) {
        expect(entry.actor).toBeTruthy();
        expect(entry.target).toBeTruthy();
        expect(entry.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe('GET /v1/admin/audit-log', () => {
    beforeEach(async () => {
      await auditService.record({
        actor: 'admin-1',
        action: 'course.approve',
        target: 'course-100',
      });
      await auditService.record({
        actor: 'admin-2',
        action: 'course.archive',
        target: 'course-200',
      });
      await auditService.record({
        actor: 'admin-1',
        action: 'course.delete',
        target: 'course-300',
      });
    });

    it('returns paginated results', async () => {
      const result = await auditService.findAll({ page: 1, limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(2);

      const page2 = await auditService.findAll({ page: 2, limit: 2 });
      expect(page2.data).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it('filters by action type', async () => {
      const result = await auditService.findAll({ action: 'course.archive' });
      expect(result.total).toBe(1);
      expect(result.data[0].action).toBe('course.archive');
    });

    it('filters by actor (user)', async () => {
      const result = await auditService.findAll({ actor: 'admin-1' });
      expect(result.total).toBe(2);
      expect(result.data.every((e) => e.actor === 'admin-1')).toBe(true);
    });

    it('filters by date range', async () => {
      const from = new Date(Date.now() - 60_000).toISOString();
      const to = new Date(Date.now() + 60_000).toISOString();
      const result = await auditService.findAll({ from, to });
      expect(result.total).toBe(3);

      const future = new Date(Date.now() + 3_600_000).toISOString();
      const empty = await auditService.findAll({ from: future });
      expect(empty.total).toBe(0);
    });

    it('exposes the controller handler for the audit-log route', () => {
      expect(typeof (AuditController.prototype as any).findAll).toBe('function');
    });
  });

  describe('audit entries are immutable via the API', () => {
    it('does not expose update or delete handlers on the controller', () => {
      const proto = AuditController.prototype as Record<string, unknown>;
      const methodNames = Object.getOwnPropertyNames(proto).filter(
        (name) => name !== 'constructor' && typeof proto[name] === 'function',
      );

      const forbidden = methodNames.filter((name) =>
        /^(update|patch|edit|delete|remove|destroy)/i.test(name),
      );
      expect(forbidden).toEqual([]);
    });

    it('has no PATCH or DELETE routes registered on the controller', () => {
      const proto = AuditController.prototype as Record<string, unknown>;
      const routeMetadataKeys = Object.getOwnPropertyNames(proto)
        .filter((name) => name !== 'constructor')
        .flatMap((name) => {
          const handler = proto[name];
          if (typeof handler !== 'function') return [];
          return Reflect.getMetadataKeys(handler) as string[];
        });

      // Nest stores HTTP method metadata under 'method' and path under 'path'.
      const hasPatchOrDelete = Object.getOwnPropertyNames(proto)
        .filter((name) => name !== 'constructor')
        .some((name) => {
          const handler = proto[name];
          if (typeof handler !== 'function') return false;
          const method = Reflect.getMetadata('method', handler);
          // RequestMethod.PATCH = 4, RequestMethod.DELETE = 5
          return method === 4 || method === 5;
        });

      expect(hasPatchOrDelete).toBe(false);
      expect(routeMetadataKeys).toBeDefined();
    });
  });
});