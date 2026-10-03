import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { TEST_ACCOUNT_PASSWORD } from '../../prisma/seed/identity.js';

/** A supertest agent that is signed in (keeps the session cookie between requests). */
export async function signInAs(app: NestExpressApplication, email: string) {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/login').send({ email, password: TEST_ACCOUNT_PASSWORD }).expect(200);
  return agent;
}
