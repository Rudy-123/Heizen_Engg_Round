import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  ROLE_DEFINITIONS,
  seedIdentity,
  TEST_ACCOUNT_PASSWORD,
  TEST_ACCOUNTS,
} from '../prisma/seed/identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';

function setCookieHeader(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.join('; ') ?? '';
}

describe('Sign-in and sessions (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await seedIdentity(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(TEST_ACCOUNTS)(
    '$email signs in with the exact test credentials and gets only its role’s permissions',
    async (account) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: account.email, password: TEST_ACCOUNT_PASSWORD })
        .expect(200);

      const role = ROLE_DEFINITIONS.find((r) => r.key === account.roleKey);
      expect(response.body.role.key).toBe(account.roleKey);
      expect([...response.body.permissions].sort()).toEqual([...(role?.permissions ?? [])].sort());
      expect(response.body).not.toHaveProperty('passwordHash');

      const cookie = setCookieHeader(response);
      expect(cookie).toMatch(/fernleaf_session=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    },
  );

  it('accepts the email in any letter case', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: '  Admin@Test.COM ', password: TEST_ACCOUNT_PASSWORD })
      .expect(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'kitchen@test.com', password: 'wrong' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: TEST_ACCOUNT_PASSWORD })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Email or password is incorrect.',
    });
  });

  it('reports invalid sign-in input field by field', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.fieldErrors.map((e: { path: string }) => e.path).sort()).toEqual([
      'email',
      'password',
    ]);
  });

  it('GET /api/auth/me needs a session', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged session cookie', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'fernleaf_session=not.a.real.token')
      .expect(401);
  });

  it('GET /api/auth/me returns the signed-in user, and logout ends the session', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: 'dispatch@test.com', password: TEST_ACCOUNT_PASSWORD })
      .expect(200);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ email: 'dispatch@test.com', role: { key: 'dispatch' } });

    const logout = await agent.post('/api/auth/logout').expect(204);
    expect(setCookieHeader(logout)).toMatch(/fernleaf_session=;.*Expires=Thu, 01 Jan 1970/i);
    await agent.get('/api/auth/me').expect(401);
  });

  it('signs a deactivated account out immediately, even with a valid cookie', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: 'driver@test.com', password: TEST_ACCOUNT_PASSWORD })
      .expect(200);

    await prisma.user.update({ where: { email: 'driver@test.com' }, data: { isActive: false } });
    try {
      await agent.get('/api/auth/me').expect(401);
      await agent
        .post('/api/auth/login')
        .send({ email: 'driver@test.com', password: TEST_ACCOUNT_PASSWORD })
        .expect(401);
    } finally {
      await prisma.user.update({ where: { email: 'driver@test.com' }, data: { isActive: true } });
    }
  });

  it('limits repeated sign-in attempts for the same email', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'guess-me@test.com', password: 'wrong' });

    for (let i = 0; i < 10; i++) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  });
});
