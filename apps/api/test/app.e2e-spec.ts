import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const allowedOrigin = 'https://app.example.com';

  beforeAll(async () => {
    process.env.ALLOWED_ORIGINS = allowedOrigin;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  describe('CORS', () => {
    it('allows requests from a configured origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('Origin', allowedOrigin);

      expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    });

    it('rejects requests from an unlisted origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('Origin', 'http://evil.example.com');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
