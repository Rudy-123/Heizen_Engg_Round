import type { PriceTierDto, TierGridDto, TierGridRowDto } from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import { seedIdentity } from '../prisma/seed/identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

describe('Pricing (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let kitchen: request.Agent;
  let dispatch: request.Agent;
  const ids: Record<string, string> = {};

  async function grid(tier: string): Promise<TierGridDto> {
    const { body } = await admin.get(`/api/pricing/tiers/${ids[tier]}/grid`).expect(200);
    return body as TierGridDto;
  }

  function row(rows: TierGridRowDto[], key: string): TierGridRowDto | undefined {
    return rows.find((candidate) => candidate.id === ids[key]);
  }

  async function tiers(): Promise<PriceTierDto[]> {
    const { body } = await admin.get('/api/pricing/tiers').expect(200);
    return body as PriceTierDto[];
  }

  beforeAll(async () => {
    app = await createTestApp();
    await seedIdentity(app.get(PrismaService));
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');
    dispatch = await signInAs(app, 'dispatch@test.com');

    // Something to price. Names are unique to this file: all e2e files share one database.
    for (const [key, sku, costCents, isActive] of [
      ['bowl', 'PRC-BOWL', 88, true],
      ['wrap', 'PRC-WRAP', 350, true],
      ['retired', 'PRC-OLD', 100, false],
    ] as const) {
      const { body } = await admin
        .post('/api/dishes')
        .send({
          sku,
          name: `Pricing ${key}`,
          imageUrl: null,
          temperature: 'HOT',
          costCents,
          kitchenStationId: null,
          minOrderQuantity: null,
          isActive,
        })
        .expect(201);
      ids[key] = body.id;
    }
    const { body } = await admin
      .post('/api/options')
      .send({ name: 'Pricing raita', costCents: 40 })
      .expect(201);
    ids.raita = body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('tiers', () => {
    it('admins create tiers with rules; there is always exactly one default', async () => {
      const hadTiers = (await tiers()).length > 0;
      const standard = await admin
        .post('/api/pricing/tiers')
        .send({ name: 'E2E Standard', ruleBasis: 'NONE' })
        .expect(201);
      ids.standard = standard.body.id;
      // The first tier ever created becomes the default.
      expect(standard.body.isDefault).toBe(!hadTiers);

      // Bodies are built one at a time: "chained" needs the id of "markup", created just before it.
      for (const [key, body] of [
        ['markup', () => ({ name: 'E2E Cost x 2.4', ruleBasis: 'COST', multiplierBps: 24_000 })],
        [
          'plus15',
          () => ({
            name: 'E2E Standard + 15%',
            ruleBasis: 'TIER',
            baseTierId: ids.standard,
            multiplierBps: 11_500,
          }),
        ],
        [
          'chained',
          () => ({
            name: 'E2E Chained',
            ruleBasis: 'TIER',
            baseTierId: ids.markup,
            multiplierBps: 11_500,
          }),
        ],
      ] as const) {
        const created = await admin.post('/api/pricing/tiers').send(body()).expect(201);
        ids[key] = created.body.id;
        expect(created.body.isDefault).toBe(false);
      }

      const plus15 = (await tiers()).find((tier) => tier.id === ids.plus15);
      expect(plus15).toMatchObject({
        ruleBasis: 'TIER',
        baseTier: { id: ids.standard, name: 'E2E Standard' },
        multiplierBps: 11_500,
      });
      expect((await tiers()).filter((tier) => tier.isDefault)).toHaveLength(1);
    });

    it('rejects bad rules field by field', async () => {
      const noName = await admin
        .post('/api/pricing/tiers')
        .send({ name: ' ', ruleBasis: 'NONE' })
        .expect(400);
      expect(noName.body.fieldErrors).toEqual([{ path: 'name', message: 'Enter a name.' }]);

      const noMultiplier = await admin
        .post('/api/pricing/tiers')
        .send({ name: 'E2E Broken', ruleBasis: 'COST' })
        .expect(400);
      expect(noMultiplier.body.fieldErrors).toMatchObject([{ path: 'multiplierBps' }]);

      const noBase = await admin
        .post('/api/pricing/tiers')
        .send({ name: 'E2E Broken', ruleBasis: 'TIER', multiplierBps: 11_500 })
        .expect(400);
      expect(noBase.body.fieldErrors).toMatchObject([{ path: 'baseTierId' }]);

      const zero = await admin
        .post('/api/pricing/tiers')
        .send({ name: 'E2E Broken', ruleBasis: 'COST', multiplierBps: 0 })
        .expect(400);
      expect(zero.body.fieldErrors).toMatchObject([{ path: 'multiplierBps' }]);

      const unknownBase = await admin
        .post('/api/pricing/tiers')
        .send({ name: 'E2E Broken', ruleBasis: 'TIER', baseTierId: 'nope', multiplierBps: 11_500 })
        .expect(422);
      expect(unknownBase.body).toMatchObject({
        code: 'UNKNOWN_REFERENCE',
        fieldErrors: [{ path: 'baseTierId' }],
      });

      const clash = await admin
        .post('/api/pricing/tiers')
        .send({ name: 'E2E Standard', ruleBasis: 'NONE' })
        .expect(422);
      expect(clash.body).toMatchObject({ code: 'NAME_TAKEN', fieldErrors: [{ path: 'name' }] });
    });

    it('refuses a rule that would make a loop', async () => {
      const loop = await admin
        .put(`/api/pricing/tiers/${ids.standard}`)
        .send({
          name: 'E2E Standard',
          ruleBasis: 'TIER',
          baseTierId: ids.plus15,
          multiplierBps: 10_000,
        })
        .expect(422);
      expect(loop.body).toMatchObject({
        code: 'PRICE_RULE_LOOP',
        message: 'That would make a loop: E2E Standard → E2E Standard + 15% → E2E Standard.',
        fieldErrors: [{ path: 'baseTierId' }],
      });

      const itself = await admin
        .put(`/api/pricing/tiers/${ids.standard}`)
        .send({
          name: 'E2E Standard',
          ruleBasis: 'TIER',
          baseTierId: ids.standard,
          multiplierBps: 10_000,
        })
        .expect(422);
      expect(itself.body.code).toBe('PRICE_RULE_LOOP');
    });

    it('two admins closing a loop at the same moment: one of them is refused', async () => {
      const created: string[] = [];
      for (const name of ['E2E Race A', 'E2E Race B']) {
        const { body } = await admin
          .post('/api/pricing/tiers')
          .send({ name, ruleBasis: 'NONE' })
          .expect(201);
        created.push(body.id);
      }
      const [a, b] = created as [string, string];
      const results = await Promise.all([
        admin
          .put(`/api/pricing/tiers/${a}`)
          .send({ name: 'E2E Race A', ruleBasis: 'TIER', baseTierId: b, multiplierBps: 10_000 }),
        admin
          .put(`/api/pricing/tiers/${b}`)
          .send({ name: 'E2E Race B', ruleBasis: 'TIER', baseTierId: a, multiplierBps: 10_000 }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 422]);
    });

    it('moves the default in one step', async () => {
      const originalDefault = (await tiers()).find((tier) => tier.isDefault);
      const moved = await admin.post(`/api/pricing/tiers/${ids.markup}/make-default`).expect(200);
      expect(moved.body.isDefault).toBe(true);
      expect((await tiers()).filter((tier) => tier.isDefault).map((tier) => tier.id)).toEqual([
        ids.markup,
      ]);
      await admin.post(`/api/pricing/tiers/${originalDefault?.id}/make-default`).expect(200);
    });
  });

  describe('prices', () => {
    it('works out every price: typed, derived and rounded up to 5 cents, or missing', async () => {
      await admin
        .put(`/api/pricing/tiers/${ids.standard}/prices`)
        .send({
          dishes: [{ id: ids.bowl, priceCents: 1_090 }],
          options: [{ id: ids.raita, priceCents: 50 }],
        })
        .expect(200);

      const standard = await grid('standard');
      expect(row(standard.dishes, 'bowl')).toMatchObject({
        priceCents: 1_090,
        source: 'EXPLICIT',
        explicitCents: 1_090,
        derivedCents: null,
      });
      expect(row(standard.dishes, 'wrap')).toMatchObject({ priceCents: null, source: 'MISSING' });

      // Cost x 2.4: 88 -> 211.2 -> $2.15 · 350 -> $8.40 · 40 -> 96 -> $1.00
      const markup = await grid('markup');
      expect(row(markup.dishes, 'bowl')).toMatchObject({ priceCents: 215, source: 'DERIVED' });
      expect(row(markup.dishes, 'wrap')).toMatchObject({ priceCents: 840, source: 'DERIVED' });
      expect(row(markup.options, 'raita')).toMatchObject({ priceCents: 100, source: 'DERIVED' });

      // Standard + 15%: 1 090 -> 1 253.5 -> $12.55 · raita 50 -> 57.5 -> $0.60 · wrap has no
      // Standard price, so none here either.
      const plus15 = await grid('plus15');
      expect(row(plus15.dishes, 'bowl')).toMatchObject({ priceCents: 1_255, source: 'DERIVED' });
      expect(row(plus15.options, 'raita')).toMatchObject({ priceCents: 60, source: 'DERIVED' });
      expect(row(plus15.dishes, 'wrap')).toMatchObject({ priceCents: null, source: 'MISSING' });

      // Chained (cost x 2.4, then + 15%) rounds at each step: 215 x 1.15 = 247.25 -> $2.50.
      expect(row((await grid('chained')).dishes, 'bowl')?.priceCents).toBe(250);
    });

    it('a typed price overrides the rule; removing it brings the rule back', async () => {
      await admin
        .put(`/api/pricing/tiers/${ids.markup}/prices`)
        .send({ dishes: [{ id: ids.bowl, priceCents: 199 }] })
        .expect(200);
      expect(row((await grid('markup')).dishes, 'bowl')).toMatchObject({
        priceCents: 199,
        source: 'EXPLICIT',
        explicitCents: 199,
        derivedCents: 215,
      });
      // Tiers built on Markup start from the typed price: 199 x 1.15 = 228.85 -> $2.30.
      expect(row((await grid('chained')).dishes, 'bowl')?.priceCents).toBe(230);

      await admin
        .put(`/api/pricing/tiers/${ids.markup}/prices`)
        .send({ dishes: [{ id: ids.bowl, priceCents: null }] })
        .expect(200);
      expect(row((await grid('markup')).dishes, 'bowl')).toMatchObject({
        priceCents: 215,
        source: 'DERIVED',
      });
    });

    it('a typed $0 is a real price, not a missing one', async () => {
      const { body } = await admin
        .put(`/api/pricing/tiers/${ids.standard}/prices`)
        .send({ options: [{ id: ids.raita, priceCents: 0 }] })
        .expect(200);
      expect(row((body as TierGridDto).options, 'raita')).toMatchObject({
        priceCents: 0,
        source: 'EXPLICIT',
      });
    });

    it('counts active items without a price, so gaps are easy to spot', async () => {
      const missingOnStandard = async () =>
        (await tiers()).find((tier) => tier.id === ids.standard)?.missingDishCount ?? -1;
      const before = await missingOnStandard();
      expect(before).toBeGreaterThan(0);

      // A switched-off dish is never counted as a gap.
      await admin
        .put(`/api/pricing/tiers/${ids.standard}/prices`)
        .send({ dishes: [{ id: ids.retired, priceCents: 500 }] })
        .expect(200);
      expect(await missingOnStandard()).toBe(before);

      await admin
        .put(`/api/pricing/tiers/${ids.standard}/prices`)
        .send({ dishes: [{ id: ids.wrap, priceCents: 900 }] })
        .expect(200);
      expect(await missingOnStandard()).toBe(before - 1);
    });

    it('changing a rule re-prices everything derived from it', async () => {
      await admin
        .put(`/api/pricing/tiers/${ids.markup}`)
        .send({ name: 'E2E Cost x 2.5', ruleBasis: 'COST', multiplierBps: 25_000 })
        .expect(200);
      expect(row((await grid('markup')).dishes, 'bowl')?.priceCents).toBe(220);
    });

    it('validates price changes and refuses unknown items', async () => {
      const negative = await admin
        .put(`/api/pricing/tiers/${ids.standard}/prices`)
        .send({ dishes: [{ id: ids.bowl, priceCents: -1 }] })
        .expect(400);
      expect(negative.body.fieldErrors).toMatchObject([{ path: 'dishes.0.priceCents' }]);

      await admin.put(`/api/pricing/tiers/${ids.standard}/prices`).send({ dishes: [] }).expect(400);

      const unknown = await admin
        .put(`/api/pricing/tiers/${ids.standard}/prices`)
        .send({ dishes: [{ id: 'no-such-dish', priceCents: 100 }] })
        .expect(422);
      expect(unknown.body.code).toBe('UNKNOWN_REFERENCE');

      await admin
        .put('/api/pricing/tiers/no-such-tier/prices')
        .send({ dishes: [{ id: ids.bowl, priceCents: 100 }] })
        .expect(404);
    });
  });

  describe('access', () => {
    it('only roles with pricing access can see or change prices', async () => {
      await kitchen.get('/api/pricing/tiers').expect(403);
      await dispatch.get(`/api/pricing/tiers/${ids.standard}/grid`).expect(403);
      await kitchen
        .put(`/api/pricing/tiers/${ids.standard}/prices`)
        .send({ dishes: [{ id: ids.bowl, priceCents: 1 }] })
        .expect(403);
      await dispatch
        .post('/api/pricing/tiers')
        .send({ name: 'E2E Sneaky', ruleBasis: 'NONE' })
        .expect(403);
    });
  });
});
