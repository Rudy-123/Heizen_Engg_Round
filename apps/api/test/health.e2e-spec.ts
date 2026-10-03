import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

describe('API basics (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health reports ok and the kitchen time zone, without signing in', async () => {
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
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
      .expect(400);
    expect(response.body).toMatchObject({ statusCode: 400, code: 'MALFORMED_REQUEST' });
  });
});
