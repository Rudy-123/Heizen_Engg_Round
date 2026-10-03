import type { DishDetailDto, OptionDto, ReferenceDataDto } from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import { seedIdentity } from '../prisma/seed/identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

describe('Catalogue (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let kitchen: request.Agent;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();
    await seedIdentity(app.get(PrismaService));
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('reference lists', () => {
    it('admins add items; names are unique per list', async () => {
      for (const [kind, name, key] of [
        ['allergens', 'Dairy', 'dairy'],
        ['allergens', 'Nuts', 'nuts'],
        ['dietary-tags', 'Vegan', 'vegan'],
        ['kitchen-stations', 'Bowls', 'bowls'],
        ['portion-sizes', 'Regular', 'regular'],
        ['portion-sizes', 'Large', 'large'],
      ] as const) {
        const { body } = await admin.post(`/api/reference/${kind}`).send({ name }).expect(201);
        ids[key] = body.id;
      }
      const clash = await admin
        .post('/api/reference/allergens')
        .send({ name: 'Dairy' })
        .expect(422);
      expect(clash.body).toMatchObject({ code: 'NAME_TAKEN', fieldErrors: [{ path: 'name' }] });
    });

    it('items are deactivated, not deleted, and every signed-in role can read the lists', async () => {
      await admin
        .patch(`/api/reference/allergens/${ids.nuts}`)
        .send({ isActive: false })
        .expect(200);
      const { body } = await kitchen.get('/api/reference').expect(200);
      const lists = body as ReferenceDataDto;
      expect(lists.allergens.map((a) => [a.name, a.isActive])).toEqual([
        ['Dairy', true],
        ['Nuts', false],
      ]);
      expect(Object.keys(lists).sort()).toEqual([
        'allergens',
        'dietary-tags',
        'kitchen-stations',
        'packaging-types',
        'portion-sizes',
      ]);
    });

    it('refuses unknown list names and non-admin writes', async () => {
      await admin.post('/api/reference/colours').send({ name: 'Red' }).expect(400);
      await kitchen.post('/api/reference/allergens').send({ name: 'Soy' }).expect(403);
    });
  });

  describe('options', () => {
    it('creates options with allergens, tags and portion sizes', async () => {
      const paneer = await admin
        .post('/api/options')
        .send({
          name: 'Paneer',
          costCents: 120,
          allergenIds: [ids.dairy],
          portions: [
            { portionSizeId: ids.regular, extraChargeCents: 0 },
            { portionSizeId: ids.large, extraChargeCents: 150 },
          ],
        })
        .expect(201);
      ids.paneer = paneer.body.id;
      expect(paneer.body.portions.map((p: OptionDto['portions'][0]) => p.portionSizeName)).toEqual([
        'Regular',
        'Large',
      ]);

      const tofu = await admin
        .post('/api/options')
        .send({
          name: 'Tofu',
          costCents: 100,
          dietaryTagIds: [ids.vegan],
          portions: [{ portionSizeId: ids.regular, extraChargeCents: 0 }],
        })
        .expect(201);
      ids.tofu = tofu.body.id;
    });

    it('hides costs from roles without pricing access', async () => {
      const { body } = await kitchen.get('/api/options').expect(200);
      expect(body.every((o: OptionDto) => o.costCents === null)).toBe(true);
      const asAdmin = await admin.get('/api/options').expect(200);
      expect(asAdmin.body.find((o: OptionDto) => o.name === 'Paneer').costCents).toBe(120);
    });
  });

  describe('dishes and option groups', () => {
    it('creates a dish; SKUs are normalised and unique', async () => {
      const { body } = await admin
        .post('/api/dishes')
        .send({
          sku: 'bwl-001',
          name: 'Paneer rice bowl',
          imageUrl: '',
          temperature: 'HOT',
          costCents: 250,
          kitchenStationId: ids.bowls,
          minOrderQuantity: null,
          allergenIds: [ids.dairy],
        })
        .expect(201);
      ids.bowl = body.id;
      expect(body).toMatchObject({ sku: 'BWL-001', imageUrl: null, isActive: true });

      const clash = await admin
        .post('/api/dishes')
        .send({
          sku: 'BWL-001',
          name: 'Copy',
          temperature: 'COLD',
          costCents: 1,
          kitchenStationId: null,
          minOrderQuantity: null,
          imageUrl: null,
        })
        .expect(422);
      expect(clash.body).toMatchObject({ code: 'SKU_TAKEN', fieldErrors: [{ path: 'sku' }] });
    });

    it('rejects bad input field by field', async () => {
      const { body } = await admin
        .post('/api/dishes')
        .send({
          sku: '!',
          name: '',
          temperature: 'WARM',
          costCents: -5,
          kitchenStationId: null,
          minOrderQuantity: 0,
          imageUrl: 'not a url',
        })
        .expect(400);
      expect(body.fieldErrors.map((e: { path: string }) => e.path).sort()).toEqual([
        'costCents',
        'imageUrl',
        'minOrderQuantity',
        'name',
        'sku',
        'temperature',
      ]);
    });

    it('refuses a portioned group with an option that is not sold in its sizes', async () => {
      const { body } = await admin
        .put(`/api/dishes/${ids.bowl}/option-groups`)
        .send({
          groups: [
            {
              name: 'Choose your protein',
              isRequired: true,
              maxSelections: 1,
              usesPortions: true,
              portionSizeIds: [ids.regular, ids.large],
              optionIds: [ids.paneer, ids.tofu],
            },
          ],
        })
        .expect(422);
      expect(body.code).toBe('INVALID_OPTION_GROUPS');
      expect(body.fieldErrors).toEqual([
        {
          path: 'groups.0.optionIds.1',
          message: '“Tofu” isn’t sold in Large. Add that size to the option first.',
        },
      ]);
    });

    it('saves option groups in order and updates them in place', async () => {
      const first = await admin
        .put(`/api/dishes/${ids.bowl}/option-groups`)
        .send({
          groups: [
            {
              name: 'Choose your protein',
              isRequired: true,
              maxSelections: 1,
              usesPortions: true,
              portionSizeIds: [ids.regular],
              optionIds: [ids.paneer, ids.tofu],
            },
          ],
        })
        .expect(200);
      const groupId = (first.body as DishDetailDto).optionGroups[0]!.id;

      const second = await admin
        .put(`/api/dishes/${ids.bowl}/option-groups`)
        .send({
          groups: [
            {
              name: 'Extras',
              isRequired: false,
              maxSelections: 2,
              usesPortions: false,
              portionSizeIds: [],
              optionIds: [ids.tofu, ids.paneer],
            },
            {
              id: groupId,
              name: 'Choose your protein',
              isRequired: true,
              maxSelections: 1,
              usesPortions: true,
              portionSizeIds: [ids.regular],
              optionIds: [ids.tofu, ids.paneer],
            },
          ],
        })
        .expect(200);
      const dish = second.body as DishDetailDto;
      expect(dish.optionGroups.map((g) => g.name)).toEqual(['Extras', 'Choose your protein']);
      expect(dish.optionGroups[1]!.id).toBe(groupId); // updated, not re-created
      expect(dish.optionGroups[1]!.options.map((o) => o.name)).toEqual(['Tofu', 'Paneer']);
    });

    it('an option cannot drop a size that a portioned group still sells it in', async () => {
      const { body } = await admin
        .put(`/api/options/${ids.paneer}`)
        .send({
          name: 'Paneer',
          costCents: 120,
          allergenIds: [ids.dairy],
          portions: [{ portionSizeId: ids.large, extraChargeCents: 150 }],
        })
        .expect(422);
      expect(body.code).toBe('PORTION_SIZE_IN_USE');
      expect(body.message).toContain('Choose your protein');
    });

    it('kitchen can read dishes (without cost) but not change them', async () => {
      const { body } = await kitchen.get(`/api/dishes/${ids.bowl}`).expect(200);
      expect(body).toMatchObject({ name: 'Paneer rice bowl', costCents: null });
      await kitchen.put(`/api/dishes/${ids.bowl}`).send({}).expect(403);
      const list = await kitchen.get('/api/dishes?search=bwl').expect(200);
      expect(list.body.map((d: { sku: string }) => d.sku)).toEqual(['BWL-001']);
    });

    it('dishes are deactivated, never deleted', async () => {
      await admin
        .put(`/api/dishes/${ids.bowl}`)
        .send({
          sku: 'BWL-001',
          name: 'Paneer rice bowl',
          temperature: 'HOT',
          costCents: 250,
          kitchenStationId: ids.bowls,
          minOrderQuantity: 5,
          imageUrl: null,
          allergenIds: [ids.dairy],
          isActive: false,
        })
        .expect(200);
      const inactive = await admin.get('/api/dishes?status=inactive').expect(200);
      expect(inactive.body.map((d: { sku: string }) => d.sku)).toContain('BWL-001');
      await admin.delete(`/api/dishes/${ids.bowl}`).expect(404); // there is no delete route
    });
  });
});
