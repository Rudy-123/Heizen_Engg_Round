import type { RoleDto, StaffMemberDto } from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { seedIdentity } from '../prisma/seed/identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

describe('Staff and roles (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let kitchen: request.Agent;
  let roles: RoleDto[];
  const role = (key: string) => roles.find((r) => r.key === key)?.id ?? '';

  async function staff(): Promise<StaffMemberDto[]> {
    return (await admin.get('/api/staff').expect(200)).body as StaffMemberDto[];
  }
  const member = async (email: string) => (await staff()).find((s) => s.email === email);
  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    app = await createTestApp();
    await seedIdentity(app.get(PrismaService));
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');
    roles = (await admin.get('/api/staff/roles').expect(200)).body as RoleDto[];
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the roles with their permissions - admins are not drivers', () => {
    expect(roles.map((r) => r.key).sort()).toEqual(['admin', 'dispatch', 'driver', 'kitchen']);
    const adminRole = roles.find((r) => r.key === 'admin');
    expect(adminRole?.permissions).toContain('STAFF_MANAGE');
    expect(adminRole?.permissions).not.toContain('DELIVERIES_OWN');
    expect(roles.find((r) => r.key === 'driver')?.permissions).toEqual(['DELIVERIES_OWN']);
  });

  it('admins create staff with one role; the new person signs in with that role’s access', async () => {
    const { body } = await admin
      .post('/api/staff')
      .send({
        name: 'Ravi Kumar',
        email: 'Ravi.Kumar@Fernleaf.example',
        roleId: role('driver'),
        password: 'first-shift-1',
      })
      .expect(201);
    expect(body).toMatchObject({
      email: 'ravi.kumar@fernleaf.example',
      role: { key: 'driver' },
      isActive: true,
      isReviewerAccount: false,
    });

    const signedIn = await login('ravi.kumar@fernleaf.example', 'first-shift-1').expect(200);
    expect(signedIn.body.permissions).toEqual(['DELIVERIES_OWN']);

    const clash = await admin
      .post('/api/staff')
      .send({
        name: 'Copy',
        email: 'ravi.kumar@fernleaf.example',
        roleId: role('driver'),
        password: 'whatever-1',
      })
      .expect(422);
    expect(clash.body).toMatchObject({ code: 'EMAIL_TAKEN', fieldErrors: [{ path: 'email' }] });

    const short = await admin
      .post('/api/staff')
      .send({
        name: 'Short',
        email: 'short@fernleaf.example',
        roleId: role('driver'),
        password: '123',
      })
      .expect(400);
    expect(short.body.fieldErrors).toMatchObject([{ path: 'password' }]);
  });

  it('changing a role or switching someone off takes effect on their very next request', async () => {
    const ravi = await member('ravi.kumar@fernleaf.example');
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: 'ravi.kumar@fernleaf.example', password: 'first-shift-1' })
      .expect(200);

    await admin
      .put(`/api/staff/${ravi?.id}`)
      .send({ name: 'Ravi Kumar', email: ravi?.email, roleId: role('kitchen'), isActive: true })
      .expect(200);
    expect((await agent.get('/api/auth/me').expect(200)).body.role.key).toBe('kitchen');

    await admin
      .put(`/api/staff/${ravi?.id}`)
      .send({ name: 'Ravi Kumar', email: ravi?.email, roleId: role('kitchen'), isActive: false })
      .expect(200);
    await agent.get('/api/auth/me').expect(401);
    await login('ravi.kumar@fernleaf.example', 'first-shift-1').expect(401);
  });

  it('resets a password: the old one stops working', async () => {
    const { body } = await admin
      .post('/api/staff')
      .send({
        name: 'Meera Das',
        email: 'meera@fernleaf.example',
        roleId: role('dispatch'),
        password: 'old-password-1',
      })
      .expect(201);
    await admin
      .put(`/api/staff/${body.id}/password`)
      .send({ password: 'new-password-2' })
      .expect(200);
    await login('meera@fernleaf.example', 'old-password-1').expect(401);
    await login('meera@fernleaf.example', 'new-password-2').expect(200);
  });

  it('keeps the four reviewer accounts exactly as the assignment gives them', async () => {
    const driver = await member('driver@test.com');
    const change = await admin
      .put(`/api/staff/${driver?.id}`)
      .send({
        name: 'Vikram Singh',
        email: 'driver@test.com',
        roleId: role('kitchen'),
        isActive: true,
      })
      .expect(422);
    expect(change.body.code).toBe('REVIEWER_ACCOUNT_LOCKED');
    await admin
      .put(`/api/staff/${driver?.id}/password`)
      .send({ password: 'hijacked-123' })
      .expect(422);

    // Name and phone are fine to change.
    await admin
      .put(`/api/staff/${driver?.id}`)
      .send({
        name: 'Vikram Singh',
        email: 'driver@test.com',
        roleId: role('driver'),
        phone: '+91 90000 00000',
        isActive: true,
      })
      .expect(200);
    await login('driver@test.com', 'Test@1234').expect(200);
  });

  it('nobody can lock themselves out, and someone can always manage staff', async () => {
    const me = await member('admin@test.com');
    // admin@test.com is a reviewer account anyway; use a second admin to test the rules.
    const { body: boss } = await admin
      .post('/api/staff')
      .send({
        name: 'Second Admin',
        email: 'boss@fernleaf.example',
        roleId: role('admin'),
        password: 'boss-password-1',
      })
      .expect(201);
    const bossAgent = request.agent(app.getHttpServer());
    await bossAgent
      .post('/api/auth/login')
      .send({ email: 'boss@fernleaf.example', password: 'boss-password-1' })
      .expect(200);

    const demoteSelf = await bossAgent
      .put(`/api/staff/${boss.id}`)
      .send({
        name: 'Second Admin',
        email: 'boss@fernleaf.example',
        roleId: role('kitchen'),
        isActive: true,
      })
      .expect(422);
    expect(demoteSelf.body).toMatchObject({
      code: 'CANNOT_LOCK_YOURSELF_OUT',
      fieldErrors: [{ path: 'roleId' }],
    });
    const offSelf = await bossAgent
      .put(`/api/staff/${boss.id}`)
      .send({
        name: 'Second Admin',
        email: 'boss@fernleaf.example',
        roleId: role('admin'),
        isActive: false,
      })
      .expect(422);
    expect(offSelf.body.fieldErrors).toMatchObject([{ path: 'isActive' }]);
    expect(me?.isReviewerAccount).toBe(true);
  });

  it('only staff managers can see or change staff', async () => {
    await kitchen.get('/api/staff').expect(403);
    await kitchen.get('/api/staff/roles').expect(403);
    await kitchen
      .post('/api/staff')
      .send({
        name: 'Sneaky',
        email: 'sneaky@fernleaf.example',
        roleId: role('admin'),
        password: 'sneaky-pass-1',
      })
      .expect(403);
  });
});
