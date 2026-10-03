import type { MenuCategoryDto, MenuPreviewDto } from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import { seedIdentity } from '../prisma/seed/identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

/** Everything this file creates starts with "MN" - all e2e files share one database. */
describe('Menu (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let kitchen: request.Agent;
  let dispatch: request.Agent;
  const ids: Record<string, string> = {};

  const category = (list: MenuCategoryDto[], name: string) => list.find((c) => c.name === name);
  const ours = (preview: MenuPreviewDto) => ({
    sections: preview.sections
      .filter((s) => s.name.startsWith('MN '))
      .map((s) => [s.name, s.dishes.map((d) => d.name)]),
    secret: preview.secretSections
      .filter((s) => s.name.startsWith('MN '))
      .map((s) => [s.name, s.dishes.map((d) => d.name)]),
    hidden: preview.hidden
      .filter((h) => h.categoryName.startsWith('MN '))
      .map((h) => [h.categoryName, h.dishName, h.reason]),
  });

  async function preview(): Promise<MenuPreviewDto> {
    const { body } = await admin.get(`/api/menu/preview?employeeId=${ids.mira}`).expect(200);
    return body as MenuPreviewDto;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await seedIdentity(app.get(PrismaService));
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');
    dispatch = await signInAs(app, 'dispatch@test.com');

    const post = async (path: string, body: object) =>
      (await admin.post(path).send(body).expect(201)).body as { id: string };

    ids.dairy = (await post('/api/reference/allergens', { name: 'MN dairy' })).id;
    ids.tofu = (await post('/api/options', { name: 'MN tofu', costCents: 90 })).id;
    for (const [key, sku, name, allergenIds] of [
      ['bowl', 'MN-BOWL', 'Paneer bowl', [ids.dairy]],
      ['wrap', 'MN-WRAP', 'Wrap', []],
      ['soup', 'MN-SOUP', 'Soup', []],
      ['cake', 'MN-CAKE', 'Cake', []],
    ] as const) {
      ids[key] = (
        await post('/api/dishes', {
          sku,
          name,
          imageUrl: null,
          temperature: 'HOT',
          costCents: 100,
          kitchenStationId: null,
          minOrderQuantity: null,
          allergenIds,
        })
      ).id;
    }
    // Soup needs a protein, but its only option (tofu) has no price on the tier.
    await admin
      .put(`/api/dishes/${ids.soup}/option-groups`)
      .send({
        groups: [
          {
            name: 'Choose your protein',
            isRequired: true,
            maxSelections: 1,
            usesPortions: false,
            optionIds: [ids.tofu],
          },
        ],
      })
      .expect(200);

    ids.tier = (await post('/api/pricing/tiers', { name: 'MN Tier', ruleBasis: 'NONE' })).id;
    await admin
      .put(`/api/pricing/tiers/${ids.tier}/prices`)
      .send({
        dishes: [
          { id: ids.bowl, priceCents: 549 },
          { id: ids.soup, priceCents: 300 },
          { id: ids.cake, priceCents: 199 },
        ],
      })
      .expect(200);

    const company = (name: string, domain: string, priceTierId: string | null) =>
      post('/api/companies', {
        name,
        domain,
        priceTierId,
        address: { label: 'Office', line1: '1 Road', city: 'Pune', postcode: '411001' },
        billingContactName: 'Accounts',
        billingEmail: `accounts@${domain}`,
        billingAddress: 'Pune',
      });
    ids.menuCo = (await company('MN Company', 'mn-co.example', ids.tier)).id;
    ids.otherCo = (await company('MN Other', 'mn-other.example', null)).id;
    ids.mira = (
      await post('/api/employees', {
        companyId: ids.menuCo,
        firstName: 'Mira',
        lastName: 'Nair',
        email: 'mira@mn-co.example',
        allergenIds: [ids.dairy],
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('categories and items', () => {
    it('creates ordered categories; names are unique', async () => {
      for (const [name, extra] of [
        ['MN Bowls', {}],
        ['MN Breakfast', {}],
        ['MN Specials', { isSecret: true }],
        ['MN Off', { isActive: false }],
      ] as const) {
        await admin
          .post('/api/menu/categories')
          .send({ name, ...extra })
          .expect(201);
      }
      const clash = await admin.post('/api/menu/categories').send({ name: 'MN Bowls' }).expect(422);
      expect(clash.body).toMatchObject({ code: 'NAME_TAKEN', fieldErrors: [{ path: 'name' }] });

      const { body } = await admin.get('/api/menu/categories').expect(200);
      for (const name of ['MN Bowls', 'MN Breakfast', 'MN Specials', 'MN Off']) {
        ids[name] = category(body, name)?.id ?? '';
      }
      expect(category(body, 'MN Specials')).toMatchObject({ isSecret: true, isActive: true });
    });

    it('puts dishes in categories, each dish once per category, in order', async () => {
      const add = (name: string, dish: string) =>
        admin.post(`/api/menu/categories/${ids[name]}/items`).send({ dishId: ids[dish] });
      for (const dish of ['soup', 'wrap', 'bowl']) await add('MN Bowls', dish).expect(201);
      await add('MN Breakfast', 'bowl').expect(201);
      await add('MN Specials', 'cake').expect(201);
      await add('MN Off', 'cake').expect(201);

      const twice = await add('MN Bowls', 'bowl').expect(422);
      expect(twice.body).toMatchObject({
        code: 'DISH_ALREADY_LISTED',
        message: 'Paneer bowl is already in MN Bowls.',
      });

      const { body } = await admin.get('/api/menu/categories').expect(200);
      const items = category(body, 'MN Bowls')?.items ?? [];
      const reordered = await admin
        .put(`/api/menu/categories/${ids['MN Bowls']}/items/order`)
        .send({ ids: [...items].reverse().map((item) => item.id) })
        .expect(200);
      expect(category(reordered.body, 'MN Bowls')?.items.map((item) => item.dish.name)).toEqual([
        'Paneer bowl',
        'Wrap',
        'Soup',
      ]);
    });

    it('reorders categories only when given every category exactly once', async () => {
      const { body } = await admin.get('/api/menu/categories').expect(200);
      const order = (body as MenuCategoryDto[]).map((c) => c.id);
      await admin
        .put('/api/menu/categories/order')
        .send({ ids: order.slice(1) })
        .expect(409);
      const specialsFirst = [
        ids['MN Specials'],
        ...order.filter((id) => id !== ids['MN Specials']),
      ];
      const saved = await admin
        .put('/api/menu/categories/order')
        .send({ ids: specialsFirst })
        .expect(200);
      expect((saved.body as MenuCategoryDto[])[0]?.name).toBe('MN Specials');
    });
  });

  describe('preview as an employee', () => {
    it('applies hiding, secret categories, pricing and allergies - and says why things are hidden', async () => {
      await admin
        .put(`/api/menu/hiding/${ids.menuCo}`)
        .send({ hiddenCategoryIds: [ids['MN Breakfast']], hiddenMenuItemIds: [] })
        .expect(200);

      const menu = await preview();
      expect(menu.tier).toMatchObject({ id: ids.tier, name: 'MN Tier', fromCompany: true });
      expect(ours(menu)).toEqual({
        sections: [['MN Bowls', ['Paneer bowl']]],
        secret: [['MN Specials', ['Cake']]],
        hidden: [
          ['MN Bowls', 'Wrap', 'NO_PRICE'],
          ['MN Bowls', 'Soup', 'REQUIRED_GROUP_EMPTY'],
          ['MN Breakfast', null, 'CATEGORY_HIDDEN_FOR_COMPANY'],
          ['MN Off', null, 'CATEGORY_INACTIVE'],
        ],
      });
      const bowl = menu.sections.find((s) => s.name === 'MN Bowls')?.dishes[0];
      expect(bowl).toMatchObject({ priceCents: 549, allergyWarnings: ['MN dairy'] });
    });

    it('switching an item off hides just that item', async () => {
      const { body } = await admin.get('/api/menu/categories').expect(200);
      const bowlItem = category(body, 'MN Bowls')?.items.find((i) => i.dish.name === 'Paneer bowl');
      await admin.patch(`/api/menu/items/${bowlItem?.id}`).send({ isActive: false }).expect(200);
      expect(ours(await preview()).hidden).toContainEqual([
        'MN Bowls',
        'Paneer bowl',
        'ITEM_INACTIVE',
      ]);
      await admin.patch(`/api/menu/items/${bowlItem?.id}`).send({ isActive: true }).expect(200);
    });

    it('moving the employee to another company changes which rules apply', async () => {
      await admin
        .put(`/api/employees/${ids.mira}`)
        .send({
          companyId: ids.otherCo,
          firstName: 'Mira',
          lastName: 'Nair',
          email: 'mira@mn-other.example',
          allergenIds: [ids.dairy],
        })
        .expect(200);
      const menu = await preview();
      expect(menu.company.name).toBe('MN Other');
      // The other company has no tier of its own (default tier) and hides nothing.
      expect(menu.tier.fromCompany).toBe(false);
      expect(
        ours(menu).hidden.map(([category, , reason]) => [category, reason]),
      ).not.toContainEqual(['MN Breakfast', 'CATEGORY_HIDDEN_FOR_COMPANY']);
    });
  });

  describe('access', () => {
    it('the kitchen and dispatch roles can’t see or change the menu', async () => {
      await kitchen.get('/api/menu/categories').expect(403);
      await dispatch.get(`/api/menu/preview?employeeId=${ids.mira}`).expect(403);
      await kitchen.post('/api/menu/categories').send({ name: 'MN Nope' }).expect(403);
    });
  });
});
