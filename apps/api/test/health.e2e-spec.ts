import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('API basics (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health reports ok and the kitchen time zone', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      kitchen: { timeZone: 'Asia/Kolkata' },
    });
    expect(response.body.kitchen.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('GET /api/health/ready confirms the database is reachable', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(response.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('unknown routes return the shared error shape', async () => {
    const response = await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('a malformed JSON body returns 400 MALFORMED_REQUEST', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
      .expect(400);
    expect(response.body).toMatchObject({ statusCode: 400, code: 'MALFORMED_REQUEST' });
  });
});
