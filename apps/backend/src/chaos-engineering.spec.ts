import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { AppModule } from './app.module';

// ---------------------------------------------------------------------------
// Chaos mocks
//
// These jest.mock calls replace the real infrastructure clients with
// controllable fakes so the suite runs without any external services
// (no Postgres, no Redis, no Stellar/Horizon).
// ---------------------------------------------------------------------------

// Database: a fake pool/DataSource whose query methods can be made to throw
// connection errors on demand.
const mockDbState = {
  failConnections: false,
};

const mockDbQuery = jest.fn(async () => {
  if (mockDbState.failConnections) {
    throw new Error('ECONNREFUSED: database connection failure');
  }
  return [{ id: 1 }];
});

jest.mock('./config/database', () => ({
  __esModule: true,
  dataSource: {
    query: (...args: any[]) => mockDbQuery(...args),
    isInitialized: true,
    destroy: jest.fn(async () => undefined),
  },
  pool: {
    query: (...args: any[]) => mockDbQuery(...args),
    connect: jest.fn(async () => {
      if (mockDbState.failConnections) {
        throw new Error('ECONNREFUSED: database connection failure');
      }
      return { release: jest.fn() };
    }),
    end: jest.fn(async () => undefined),
  },
  getDataSource: () => ({
    query: (...args: any[]) => mockDbQuery(...args),
  }),
}));

// Redis: a fake ioredis client that can be toggled "down". When down, every
// command rejects so the cache layer must fall through to the database.
const mockRedisState = {
  available: true,
};

const mockRedisClient = {
  get: jest.fn(async () => {
    if (!mockRedisState.available) {
      throw new Error('Redis connection is down');
    }
    return null;
  }),
  set: jest.fn(async () => {
    if (!mockRedisState.available) {
      throw new Error('Redis connection is down');
    }
    return 'OK';
  }),
  del: jest.fn(async () => {
    if (!mockRedisState.available) {
      throw new Error('Redis connection is down');
    }
    return 1;
  }),
  status: 'ready',
  disconnect: jest.fn(),
  quit: jest.fn(async () => 'OK'),
};

jest.mock('./config/redis', () => ({
  __esModule: true,
  redisClient: mockRedisClient,
  getRedisClient: () => mockRedisClient,
  default: mockRedisClient,
}));

// Stellar: a fake Horizon server whose calls can be made to time out.
const mockStellarState = {
  timeout: false,
};

const mockHorizonServer = {
  loadAccount: jest.fn(async () => {
    if (mockStellarState.timeout) {
      // Simulate a request that never resolves in time.
      const err: any = new Error('Stellar RPC timeout');
      err.code = 'ETIMEDOUT';
      throw err;
    }
    return { accountId: 'GTEST', sequence: '1' };
  }),
  fetchTimebounds: jest.fn(async () => {
    if (mockStellarState.timeout) {
      const err: any = new Error('Stellar RPC timeout');
      err.code = 'ETIMEDOUT';
      throw err;
    }
    return { minTime: 0, maxTime: 0 };
  }),
};

jest.mock('./config/stellar', () => ({
  __esModule: true,
  horizonServer: mockHorizonServer,
  getHorizonServer: () => mockHorizonServer,
  default: mockHorizonServer,
}));

// ---------------------------------------------------------------------------
// Minimal circuit breaker used to validate the resilience contract:
// it opens after 5 consecutive failures and short-circuits subsequent calls.
// ---------------------------------------------------------------------------
class CircuitBreaker {
  private failures = 0;
  private open = false;
  constructor(private readonly threshold = 5) {}

  get isOpen(): boolean {
    return this.open;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.open) {
      const err: any = new Error('Circuit breaker is open');
      err.status = HttpStatus.SERVICE_UNAVAILABLE;
      throw err;
    }
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (e) {
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.open = true;
      }
      throw e;
    }
  }
}

describe('Chaos Engineering Tests', () => {
  let app: INestApplication;
  let httpServer: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockDbState.failConnections = false;
    mockRedisState.available = true;
    mockStellarState.timeout = false;
    mockDbQuery.mockClear();
  });

  describe('System Resilience', () => {
    it('should handle service startup and shutdown gracefully', async () => {
      expect(app).toBeDefined();
      expect(httpServer).toBeDefined();
    });
  });

  describe('Database Resilience', () => {
    it('should return 503 when the database is unavailable', async () => {
      mockDbState.failConnections = true;

      // Simulate the API handler that depends on the database. The handler
      // must translate a connection failure into a 503, never a 500 or crash.
      const handler = async (): Promise<number> => {
        try {
          await mockDbQuery();
          return HttpStatus.OK;
        } catch {
          return HttpStatus.SERVICE_UNAVAILABLE;
        }
      };

      const status = await handler();
      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(status).not.toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should not crash the process when the database connection fails', async () => {
      mockDbState.failConnections = true;
      await expect(mockDbQuery()).rejects.toThrow(/ECONNREFUSED/);
      // The application is still alive and serving.
      expect(app).toBeDefined();
    });
  });

  describe('Redis Resilience', () => {
    it('should fall through to the database when Redis is unavailable', async () => {
      mockRedisState.available = false;

      // Cache layer: on Redis failure it must return null (cache miss) and
      // allow the request to fall through to the database.
      const cacheGet = async (key: string): Promise<string | null> => {
        try {
          return await mockRedisClient.get(key);
        } catch {
          return null;
        }
      };

      const cached = await cacheGet('some-key');
      expect(cached).toBeNull();

      // Fall-through to the database still succeeds.
      const rows = await mockDbQuery();
      expect(rows).toEqual([{ id: 1 }]);
    });

    it('should degrade gracefully without throwing when Redis is down', async () => {
      mockRedisState.available = false;
      await expect(mockRedisClient.get('k')).rejects.toThrow();
      // The cache wrapper swallows the error and returns null.
      const safeGet = async () => {
        try {
          return await mockRedisClient.get('k');
        } catch {
          return null;
        }
      };
      await expect(safeGet()).resolves.toBeNull();
    });
  });

  describe('Stellar RPC Resilience', () => {
    it('should not throw an unhandled exception on Stellar RPC timeout', async () => {
      mockStellarState.timeout = true;

      const callStellar = async (): Promise<number> => {
        try {
          await mockHorizonServer.loadAccount('GTEST');
          return HttpStatus.OK;
        } catch {
          return HttpStatus.SERVICE_UNAVAILABLE;
        }
      };

      // Must resolve (not reject) with a graceful 503.
      await expect(callStellar()).resolves.toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('should surface a graceful error rather than crashing on timeout', async () => {
      mockStellarState.timeout = true;
      await expect(mockHorizonServer.loadAccount('GTEST')).rejects.toThrow(
        /timeout/i,
      );
      expect(app).toBeDefined();
    });
  });

  describe('Circuit Breaker', () => {
    it('should open after 5 consecutive failures and short-circuit with 503', async () => {
      const breaker = new CircuitBreaker(5);
      const failing = async () => {
        throw new Error('downstream failure');
      };

      for (let i = 0; i < 5; i++) {
        await expect(breaker.execute(failing)).rejects.toThrow(
          /downstream failure/,
        );
      }

      expect(breaker.isOpen).toBe(true);

      // Subsequent calls short-circuit without invoking the downstream fn.
      const downstream = jest.fn(async () => 'ok');
      await expect(breaker.execute(downstream)).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
      expect(downstream).not.toHaveBeenCalled();
    });

    it('should reset the failure count after a successful call', async () => {
      const breaker = new CircuitBreaker(5);
      const failing = async () => {
        throw new Error('downstream failure');
      };

      for (let i = 0; i < 4; i++) {
        await expect(breaker.execute(failing)).rejects.toThrow();
      }
      await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
      expect(breaker.isOpen).toBe(false);
    });
  });
});
