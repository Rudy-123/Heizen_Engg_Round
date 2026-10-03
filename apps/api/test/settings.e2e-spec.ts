import type { PlatformSettingsDto, UpdateSettingsInput } from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import { seedIdentity } from '../prisma/seed/identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

describe('Settings (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let original: UpdateSettingsInput;

  beforeAll(async () => {
    app = await createTestApp();
    await seedIdentity(app.get(PrismaService));
    admin = await signInAs(app, 'admin@test.com');
    const { body } = await admin.get('/api/settings').expect(200);
    const {
      kitchenTimeZone: _z,
      kitchenHolidays: _h,
      updatedAt: _u,
      ...values
    } = body as PlatformSettingsDto;
    original = values;
  });

  afterAll(async () => {
    await admin.put('/api/settings').send(original).expect(200);
    await app.get(PrismaService).kitchenHoliday.deleteMany();
    await app.close();
  });

  it('returns the settings with the kitchen time zone', async () => {
    const { body } = await admin.get('/api/settings').expect(200);
    expect(body).toMatchObject({
      kitchenTimeZone: 'Asia/Kolkata',
      cutoffDaysBefore: 2,
      cutoffTimeMinutes: 960,
    });
    expect(body.kitchenWorkingDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('only lets roles with the settings permissions read or change them', async () => {
    const kitchen = await signInAs(app, 'kitchen@test.com');
    await kitchen.get('/api/settings').expect(403);
    await kitchen.put('/api/settings').send(original).expect(403);
    await kitchen
      .post('/api/settings/kitchen-holidays')
      .send({ date: '2030-01-01', name: 'x' })
      .expect(403);
  });

  it('saves valid settings and normalises lists', async () => {
    const { body } = await admin
      .put('/api/settings')
      .send({
        ...original,
        kitchenWorkingDays: [5, 1, 3, 1],
        cutoffTimeMinutes: 17 * 60,
        publicEmailDomains: ['GMAIL.com', 'gmail.com', 'yahoo.com'],
      })
      .expect(200);
    expect(body.kitchenWorkingDays).toEqual([1, 3, 5]);
    expect(body.cutoffTimeMinutes).toBe(1020);
    expect(body.publicEmailDomains).toEqual(['gmail.com', 'yahoo.com']);
  });

  it('explains invalid settings field by field', async () => {
    const { body } = await admin
      .put('/api/settings')
      .send({
        ...original,
        kitchenWorkingDays: [],
        cutoffTimeMinutes: 1500,
        deliveryWindowStartMinutes: 900,
        deliveryWindowEndMinutes: 600,
      })
      .expect(400);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors.map((e: { path: string }) => e.path).sort()).toEqual([
      'cutoffTimeMinutes',
      'deliveryWindowEndMinutes',
      'kitchenWorkingDays',
    ]);
  });

  it('adds and removes kitchen holidays, refusing duplicates', async () => {
    const created = await admin
      .post('/api/settings/kitchen-holidays')
      .send({ date: '2030-01-01', name: "New Year's Day" })
      .expect(201);
    expect(created.body).toMatchObject({ date: '2030-01-01', name: "New Year's Day" });

    const duplicate = await admin
      .post('/api/settings/kitchen-holidays')
      .send({ date: '2030-01-01', name: 'Again' })
      .expect(409);
    expect(duplicate.body.code).toBe('CONFLICT');

    await admin.delete(`/api/settings/kitchen-holidays/${created.body.id}`).expect(204);
    await admin.delete(`/api/settings/kitchen-holidays/${created.body.id}`).expect(404);
  });

  it('previews when upcoming delivery dates lock, reflecting holidays and settings', async () => {
    await admin
      .put('/api/settings')
      .send({ ...original, kitchenWorkingDays: [1, 2, 3, 4, 5, 6, 7], cutoffDaysBefore: 2 })
      .expect(200);
    const { body: before } = await admin.get('/api/settings/cutoff-preview?days=7').expect(200);
    expect(before).toHaveLength(7);
    expect(before.every((d: { kitchenOpen: boolean }) => d.kitchenOpen)).toBe(true);
    // With a 2-day cut-off, today's and tomorrow's orders are already locked.
    expect(before[0].locked).toBe(true);
    expect(before[1].locked).toBe(true);

    const closedDay = before[3].date as string;
    await admin
      .post('/api/settings/kitchen-holidays')
      .send({ date: closedDay, name: 'Deep clean' })
      .expect(201);
    const { body: after } = await admin.get('/api/settings/cutoff-preview?days=7').expect(200);
    expect(after[3]).toMatchObject({
      date: closedDay,
      kitchenOpen: false,
      holidayName: 'Deep clean',
      cutoffAt: null,
      locked: null,
    });
    // The day after the holiday now counts back past it, so it locks earlier than before.
    expect(new Date(after[4].cutoffAt).getTime()).toBeLessThan(
      new Date(before[4].cutoffAt).getTime(),
    );
  });
});
