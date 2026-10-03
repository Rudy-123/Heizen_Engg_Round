import type {
  CutoffOverviewDto,
  CutoffRunDto,
  DishDetailDto,
  OrderDetailDto,
  OrderFormContextDto,
  OrderQuoteDto,
  OrderSummaryDto,
  Page,
} from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import bcrypt from 'bcryptjs';
import type request from 'supertest';
import { vi } from 'vitest';
import { seedIdentity, TEST_ACCOUNT_PASSWORD } from '../prisma/seed/identity.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import { CutoffService } from '../src/orders/cutoff.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

/**
 * Orders and cut-off processing, with the clock frozen so cut-off moments are exact.
 * The kitchen works every day; cut-off = 2 working days before, at 16:00 (Asia/Kolkata):
 * a Wednesday 3 March 2027 delivery locks on Monday 1 March at 16:00.
 */
const MONDAY_MORNING = new Date('2027-03-01T04:30:00Z'); // Mon 10:00 IST
const MONDAY_EVENING = new Date('2027-03-01T11:00:00Z'); // Mon 16:30 IST - past the cut-off
const WEDNESDAY = '2027-03-03';
const FRIDAY = '2027-03-05';
const SATURDAY = '2027-03-06'; // the company is closed on Saturdays

describe('Orders and cut-off processing (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let taker: request.Agent; // can take orders, but has no override permission
  let kitchen: request.Agent;
  const ids: Record<string, string> = {};
  const choice: Record<
    string,
    { groupId: string; optionId: string; portionSizeId: string | null }
  > = {};

  const setNow = (now: Date) => vi.spyOn(app.get(ClockService), 'now').mockReturnValue(now);

  const bowls = (paneer: number, tofu: number) => ({
    dishId: ids.bowl,
    quantity: paneer + tofu,
    combinations: [
      { quantity: paneer, choices: [choice.paneer, choice.brownRegular] },
      { quantity: tofu, choices: [choice.tofu, choice.brownLarge] },
    ].filter((c) => c.quantity > 0),
  });
  const dosas = (quantity: number) => ({
    dishId: ids.dosa,
    quantity,
    combinations: [{ quantity, choices: [] }],
  });
  const newOrder = (extra: Record<string, unknown> = {}) => ({
    employeeId: ids.olu,
    deliveryDate: WEDNESDAY,
    lines: [bowls(6, 4)],
    ...extra,
  });
  const order = async (id: string | undefined) =>
    (await admin.get(`/api/orders/${id}`).expect(200)).body as OrderDetailDto;

  beforeAll(async () => {
    app = await createTestApp();
    const prisma = app.get(PrismaService);
    await seedIdentity(prisma);
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');

    // A new role is just data: order taking without the override permission.
    const role = await prisma.role.upsert({
      where: { key: 'order-taker' },
      create: {
        key: 'order-taker',
        name: 'Order taker',
        homeDashboard: 'ADMIN',
        permissions: ['ORDERS_READ', 'ORDERS_WRITE'],
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { email: 'taker@fernleaf.example' },
      create: {
        name: 'Tara Taker',
        email: 'taker@fernleaf.example',
        roleId: role.id,
        passwordHash: await bcrypt.hash(TEST_ACCOUNT_PASSWORD, 4),
      },
      update: {},
    });
    taker = await signInAs(app, 'taker@fernleaf.example');

    // Known settings: the kitchen works every day, cut-off 2 working days before at 16:00.
    const { body: settings } = await admin.get('/api/settings').expect(200);
    const {
      kitchenTimeZone: _zone,
      kitchenHolidays: _holidays,
      updatedAt: _updated,
      ...values
    } = settings;
    await admin
      .put('/api/settings')
      .send({
        ...values,
        kitchenWorkingDays: [1, 2, 3, 4, 5, 6, 7],
        cutoffTimeMinutes: 960,
        cutoffDaysBefore: 2,
        deliveryWindowStartMinutes: 420,
        deliveryWindowEndMinutes: 1260,
        deliverySlotMinutes: 15,
      })
      .expect(200);

    const post = async (path: string, body: object) =>
      (await admin.post(path).send(body).expect(201)).body as { id: string };
    const regular = await post('/api/reference/portion-sizes', { name: 'OR Regular' });
    const large = await post('/api/reference/portion-sizes', { name: 'OR Large' });
    const box = await post('/api/reference/packaging-types', { name: 'OR Box' });
    const bag = await post('/api/reference/packaging-types', { name: 'OR Bag' });
    ids.box = box.id;
    ids.bag = bag.id;
    ids.paneer = (await post('/api/options', { name: 'OR Paneer', costCents: 80 })).id;
    ids.tofu = (await post('/api/options', { name: 'OR Tofu', costCents: 70 })).id;
    ids.brown = (
      await post('/api/options', {
        name: 'OR Brown rice',
        costCents: 25,
        portions: [
          { portionSizeId: regular.id, extraChargeCents: 0 },
          { portionSizeId: large.id, extraChargeCents: 45 },
        ],
      })
    ).id;
    const dish = (sku: string, name: string) =>
      post('/api/dishes', {
        sku,
        name,
        imageUrl: null,
        temperature: 'HOT',
        costCents: 180,
        kitchenStationId: null,
        minOrderQuantity: null,
      });
    ids.bowl = (await dish('OR-BOWL', 'OR rice bowl')).id;
    ids.dosa = (await dish('OR-DOSA', 'OR dosa')).id;
    const { body: withGroups } = await admin
      .put(`/api/dishes/${ids.bowl}/option-groups`)
      .send({
        groups: [
          {
            name: 'Protein',
            isRequired: true,
            maxSelections: 1,
            usesPortions: false,
            optionIds: [ids.paneer, ids.tofu],
          },
          {
            name: 'Rice',
            isRequired: true,
            maxSelections: 1,
            usesPortions: true,
            portionSizeIds: [regular.id, large.id],
            optionIds: [ids.brown],
          },
        ],
      })
      .expect(200);
    const [protein, rice] = (withGroups as DishDetailDto).optionGroups;
    choice.paneer = { groupId: protein?.id ?? '', optionId: ids.paneer, portionSizeId: null };
    choice.tofu = { groupId: protein?.id ?? '', optionId: ids.tofu, portionSizeId: null };
    choice.brownRegular = {
      groupId: rice?.id ?? '',
      optionId: ids.brown,
      portionSizeId: regular.id,
    };
    choice.brownLarge = { groupId: rice?.id ?? '', optionId: ids.brown, portionSizeId: large.id };

    ids.tier = (await post('/api/pricing/tiers', { name: 'OR Tier', ruleBasis: 'NONE' })).id;
    await admin
      .put(`/api/pricing/tiers/${ids.tier}/prices`)
      .send({
        dishes: [
          { id: ids.bowl, priceCents: 500 },
          { id: ids.dosa, priceCents: 300 },
        ],
        options: [
          { id: ids.paneer, priceCents: 150 },
          { id: ids.tofu, priceCents: 120 },
          { id: ids.brown, priceCents: 50 },
        ],
      })
      .expect(200);
    const category = await admin.post('/api/menu/categories').send({ name: 'OR Menu' }).expect(201);
    const menuId = (category.body as { id: string; name: string }[]).find(
      (c) => c.name === 'OR Menu',
    )?.id;
    await admin.post(`/api/menu/categories/${menuId}/items`).send({ dishId: ids.bowl }).expect(201);
    await admin.post(`/api/menu/categories/${menuId}/items`).send({ dishId: ids.dosa }).expect(201);

    const company = await post('/api/companies', {
      name: 'OR Company',
      domain: 'or-co.example',
      priceTierId: ids.tier,
      defaultPackagingTypeId: box.id,
      address: { label: 'OR Office', line1: '1 Road', city: 'Pune', postcode: '411001' },
      billingContactName: 'Accounts',
      billingEmail: 'accounts@or-co.example',
      billingAddress: 'Pune',
    });
    ids.company = company.id;
    const annex = await admin
      .post(`/api/companies/${company.id}/addresses`)
      .send({ label: 'OR Annex', line1: '2 Road', city: 'Pune', postcode: '411002' })
      .expect(201);
    ids.annex =
      (annex.body.addresses as { id: string; label: string }[]).find((a) => a.label === 'OR Annex')
        ?.id ?? '';
    ids.olu = (
      await post('/api/employees', {
        companyId: company.id,
        firstName: 'Olu',
        lastName: 'Fixed',
        email: 'olu@or-co.example',
      })
    ).id;
    ids.ora = (
      await post('/api/employees', {
        companyId: company.id,
        firstName: 'Ora',
        lastName: 'Flexible',
        email: 'ora@or-co.example',
        canChooseAddress: true,
        canChangeDeliveryTime: true,
      })
    ).id;
    setNow(MONDAY_MORNING);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  describe('creating', () => {
    it('quotes the price breakdown per line and the order total (spec example: 10 bowls, 6 + 4)', async () => {
      const { body } = await admin
        .post('/api/orders/quote')
        .send(newOrder({ lines: [bowls(6, 4), dosas(2)] }))
        .expect(200);
      const quote = body as OrderQuoteDto;
      // Bowl 500 + paneer 150 + brown rice 50 = 700 x 6; 500 + tofu 120 + 50 + large 45 = 715 x 4.
      expect(quote.lines.map((l) => [l.dishName, l.lineTotalCents])).toEqual([
        ['OR rice bowl', 700 * 6 + 715 * 4],
        ['OR dosa', 600],
      ]);
      expect(quote.totalCents).toBe(4_200 + 2_860 + 600);
      expect(quote.tier.name).toBe('OR Tier');
    });

    it('saves a draft with snapshots of the company, tier, address, packaging and planned times', async () => {
      const { body } = await admin.post('/api/orders').send(newOrder()).expect(201);
      const draft = body as OrderDetailDto;
      ids.draft = draft.id;
      expect(draft).toMatchObject({
        status: 'DRAFT',
        company: { name: 'OR Company' },
        priceTier: { name: 'OR Tier' },
        packagingName: 'OR Box',
        deliveryTimeMinutes: 750,
        totalCents: 7_060,
        isLocked: false,
        // 12:30 IST delivery, 60 min lead, 30 min kitchen buffer.
        deliveryAt: '2027-03-03T07:00:00.000Z',
        plannedDispatchReadyAt: '2027-03-03T06:00:00.000Z',
        plannedKitchenReadyAt: '2027-03-03T05:30:00.000Z',
        cutoffAt: '2027-03-01T10:30:00.000Z',
        allowed: { edit: true, place: true, cancel: true },
      });
      expect(draft.addressText).toMatch(/^OR Office/);
      expect(draft.events.map((e) => e.type)).toEqual(['CREATED']);
    });

    it('checks every rule on the server and reports each problem on its field', async () => {
      const { body } = await admin
        .post('/api/orders')
        .send(
          newOrder({
            deliveryDate: SATURDAY,
            deliveryTimeMinutes: 785,
            addressId: ids.annex,
            lines: [{ ...bowls(6, 4), quantity: 11 }],
          }),
        )
        .expect(422);
      expect(body.code).toBe('ORDER_INVALID');
      expect(body.fieldErrors.map((e: { path: string }) => e.path)).toEqual([
        'deliveryDate', // OR Company doesn't take deliveries on Saturdays
        'deliveryTimeMinutes', // Olu can't change the delivery time
        'deliveryTimeMinutes', // and 13:05 isn't on the 15-minute grid
        'addressId', // Olu can't choose the address
        'lines.0.combinations', // 6 + 4 isn't 11
      ]);
    });

    it('lets an employee with the right flags choose the time and address', async () => {
      const { body } = await admin
        .post('/api/orders')
        .send(
          newOrder({
            employeeId: ids.ora,
            deliveryTimeMinutes: 780,
            addressId: ids.annex,
            place: true,
          }),
        )
        .expect(201);
      expect(body).toMatchObject({ status: 'PLACED', deliveryTimeMinutes: 780 });
      expect(body.addressText).toMatch(/^OR Annex/);
      ids.oraPlaced = body.id;
    });
  });

  describe('placing and editing', () => {
    it('places a draft; its prices are then locked against later price changes', async () => {
      const { version } = await order(ids.draft);
      const placed = await admin
        .post(`/api/orders/${ids.draft}/place`)
        .send({ version })
        .expect(200);
      expect(placed.body).toMatchObject({ status: 'PLACED', totalCents: 7_060 });
      expect(placed.body.events.map((e: { type: string }) => e.type)).toEqual([
        'CREATED',
        'PLACED',
      ]);

      // The bowl goes up from $5.00 to $6.00. The placed order keeps its prices for the
      // combinations it already had; a new combination is priced at today's price.
      await admin
        .put(`/api/pricing/tiers/${ids.tier}/prices`)
        .send({ dishes: [{ id: ids.bowl, priceCents: 600 }] })
        .expect(200);
      const current = await order(ids.draft);
      const edited = await admin
        .put(`/api/orders/${ids.draft}`)
        .send({
          version: current.version,
          deliveryDate: WEDNESDAY,
          lines: [
            {
              dishId: ids.bowl,
              quantity: 12,
              combinations: [
                { quantity: 6, choices: [choice.paneer, choice.brownRegular] }, // kept: 700
                { quantity: 4, choices: [choice.tofu, choice.brownLarge] }, // kept: 715
                { quantity: 2, choices: [choice.tofu, choice.brownRegular] }, // new: 600 + 120 + 50
              ],
            },
          ],
        })
        .expect(200);
      const units = (edited.body as OrderDetailDto).lines[0]?.combinations.map((c) => [
        c.quantity,
        c.unitPriceCents,
      ]);
      expect(units).toEqual([
        [6, 700],
        [4, 715],
        [2, 770],
      ]);
      expect(edited.body.totalCents).toBe(4_200 + 2_860 + 1_540);
    });

    it('refuses an edit made from an out-of-date copy (someone else changed it)', async () => {
      const stale = (await order(ids.draft)).version - 1;
      const { body } = await admin
        .put(`/api/orders/${ids.draft}`)
        .send({ version: stale, deliveryDate: WEDNESDAY, lines: [bowls(1, 0)] })
        .expect(409);
      expect(body.code).toBe('ORDER_CHANGED');
    });
  });

  describe('after the cut-off', () => {
    it('locks drafts and placed orders, except for someone with the override permission', async () => {
      const { body: late } = await taker.post('/api/orders').send(newOrder()).expect(201);
      ids.takerDraft = late.id;
      const { body: placedByTaker } = await taker
        .post('/api/orders')
        .send(newOrder({ lines: [dosas(3)], place: true }))
        .expect(201);
      ids.takerPlaced = placedByTaker.id;

      setNow(MONDAY_EVENING);
      const current = await order(ids.takerPlaced);
      expect(current).toMatchObject({ isLocked: true });

      const edit = await taker
        .put(`/api/orders/${ids.takerPlaced}`)
        .send({ version: current.version, deliveryDate: WEDNESDAY, lines: [dosas(4)] })
        .expect(422);
      expect(edit.body.message).toMatch(/only an admin/);
      await taker
        .post(`/api/orders/${ids.takerPlaced}/cancel`)
        .send({ version: current.version, reason: 'Changed my mind' })
        .expect(422);
      const draftForLockedDate = await taker.post('/api/orders').send(newOrder()).expect(422);
      expect(draftForLockedDate.body.code).toBe('CUTOFF_PASSED');
      const placeLate = await taker
        .post('/api/orders')
        .send(newOrder({ place: true }))
        .expect(422);
      expect(placeLate.body.code).toBe('CUTOFF_PASSED');

      // An admin can still place a late order; it waits for the cut-off run to confirm it.
      const { body: adminLate } = await admin
        .post('/api/orders')
        .send(newOrder({ lines: [dosas(2)], place: true }))
        .expect(201);
      expect(adminLate.status).toBe('PLACED');
      ids.adminLate = adminLate.id;
    });

    it('processing confirms placed orders, cancels drafts, and puts orders in drops', async () => {
      setNow(MONDAY_MORNING);
      const early = await admin.post(`/api/cutoffs/${WEDNESDAY}/run`).expect(422);
      expect(early.body.code).toBe('CUTOFF_NOT_PASSED');

      setNow(MONDAY_EVENING);
      const { body } = await admin.post(`/api/cutoffs/${WEDNESDAY}/run`).expect(200);
      expect(body as CutoffRunDto).toMatchObject({
        trigger: 'MANUAL',
        actorName: 'Priya Sharma',
        cancelledCount: 1, // the order taker's draft
        confirmedCount: 4, // Olu's (placed), Ora's, the taker's and the admin's late one
      });

      expect((await order(ids.takerDraft)).status).toBe('CANCELLED');
      const confirmed = await order(ids.draft);
      expect(confirmed.status).toBe('CONFIRMED');
      expect(confirmed.events.at(-1)?.message).toMatch(/now billable to OR Company/);
      const prisma = app.get(PrismaService);
      const rows = await prisma.order.findMany({
        where: {
          id: { in: [ids.draft, ids.takerPlaced, ids.adminLate, ids.oraPlaced] as string[] },
        },
        select: { id: true, dropId: true },
      });
      const drop = (id: string | undefined) => rows.find((r) => r.id === id)?.dropId;
      // Same company, address and time: one drop. Ora's goes to the annex at 13:00: another.
      expect(drop(ids.draft)).toBeTruthy();
      expect(drop(ids.takerPlaced)).toBe(drop(ids.draft));
      expect(drop(ids.adminLate)).toBe(drop(ids.draft));
      expect(drop(ids.oraPlaced)).not.toBe(drop(ids.draft));
    });

    it('running it again changes nothing - and two runs at once don’t double up', async () => {
      const { body } = await admin.post(`/api/cutoffs/${WEDNESDAY}/run`).expect(200);
      expect(body).toMatchObject({ cancelledCount: 0, confirmedCount: 0 });

      // Two placed orders for Friday, then two runs at the same moment.
      setNow(MONDAY_MORNING);
      for (let i = 0; i < 2; i += 1) {
        await admin
          .post('/api/orders')
          .send(newOrder({ deliveryDate: FRIDAY, lines: [dosas(1 + i)], place: true }))
          .expect(201);
      }
      setNow(new Date('2027-03-03T11:00:00Z')); // Wed 16:30: Friday's cut-off has passed
      const runs = await Promise.all([
        admin.post(`/api/cutoffs/${FRIDAY}/run`),
        app.get(CutoffService).process(FRIDAY, 'AUTOMATIC', null),
      ]);
      const confirmed = [runs[0].body as CutoffRunDto, runs[1]].map((r) => r.confirmedCount);
      expect(confirmed.sort()).toEqual([0, 2]);
    });

    it('the Cut-offs page shows each date’s lock time, counts and last run', async () => {
      setNow(MONDAY_EVENING);
      const { body } = await admin.get('/api/cutoffs').expect(200);
      const wednesday = (body as CutoffOverviewDto).days.find((d) => d.date === WEDNESDAY);
      expect(wednesday).toMatchObject({
        isLocked: true,
        isDue: false,
        counts: { CONFIRMED: 4, CANCELLED: 1, DRAFT: 0, PLACED: 0 },
        lastRun: { confirmedCount: 0 },
      });
    });
  });

  describe('confirmed orders', () => {
    it('only an admin may cancel, reject or change delivery - and never edit the lines', async () => {
      setNow(MONDAY_EVENING);
      const confirmed = await order(ids.takerPlaced);
      expect(confirmed.allowed).toEqual({
        edit: false,
        place: false,
        cancel: true,
        reject: true,
        changeDelivery: true,
      });
      const takerCancel = await taker
        .post(`/api/orders/${ids.takerPlaced}/cancel`)
        .send({ version: confirmed.version, reason: 'Wrong order' })
        .expect(422);
      expect(takerCancel.body.message).toBe('Only an admin can cancel a confirmed order.');
      await taker
        .post(`/api/orders/${ids.takerPlaced}/reject`)
        .send({ version: confirmed.version, reason: 'Wrong order' })
        .expect(403);
    });

    it('an admin changes delivery: planned times are worked out again and the order moves drop', async () => {
      const before = await order(ids.draft);
      const { body } = await admin
        .put(`/api/orders/${ids.draft}/delivery`)
        .send({
          version: before.version,
          deliveryTimeMinutes: 810,
          addressId: ids.annex,
          packagingTypeId: ids.bag,
        })
        .expect(200);
      expect(body).toMatchObject({
        deliveryTimeMinutes: 810,
        packagingName: 'OR Bag',
        totalCents: before.totalCents, // money never changes
        plannedKitchenReadyAt: '2027-03-03T06:30:00.000Z', // 13:30 - 60 - 30 min, in UTC
      });
      expect(body.events.at(-1).type).toBe('DELIVERY_CHANGED');
    });

    it('cancelling an order that was already invoiced raises a credit for the next invoice', async () => {
      const prisma = app.get(PrismaService);
      const target = await order(ids.adminLate);
      const invoice = await prisma.invoice.create({
        data: {
          companyId: target.company.id,
          ordersTotalCents: target.totalCents,
          totalCents: target.totalCents,
        },
      });
      await prisma.order.update({ where: { id: target.id }, data: { invoiceId: invoice.id } });

      const { body } = await admin
        .post(`/api/orders/${target.id}/cancel`)
        .send({ version: target.version, reason: 'Office closed unexpectedly' })
        .expect(200);
      expect(body.status).toBe('CANCELLED');
      expect(body.events.map((e: { type: string }) => e.type).slice(-2)).toEqual([
        'CANCELLED',
        'CREDITED',
      ]);
      const credit = await prisma.billingAdjustment.findFirst({ where: { orderId: target.id } });
      expect(credit).toMatchObject({
        amountCents: -target.totalCents,
        reason: 'CANCELLED_AFTER_INVOICE',
        invoiceId: null,
      });
    });
  });

  describe('listing', () => {
    it('filters by delivery date, status, company and invoiced, one page at a time', async () => {
      const list = async (query: string) =>
        (await admin.get(`/api/orders?${query}`).expect(200)).body as Page<OrderSummaryDto>;
      const confirmedThatDay = await list(
        `from=${WEDNESDAY}&to=${WEDNESDAY}&status=CONFIRMED&companyId=${ids.company}`,
      );
      expect(confirmedThatDay.total).toBe(3);
      expect(confirmedThatDay.items.every((o) => o.status === 'CONFIRMED')).toBe(true);
      const invoiced = await list(`companyId=${ids.company}&invoiced=yes`);
      expect(invoiced.items.map((o) => o.id)).toEqual([ids.adminLate]);
      const firstPage = await list(`companyId=${ids.company}&pageSize=2`);
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.total).toBeGreaterThan(2);
      const byName = await list(`search=Ora&companyId=${ids.company}`);
      expect(byName.items.map((o) => o.employee.name)).toEqual(['Ora Flexible']);
      const draftNumber = (await order(ids.draft)).number;
      expect((await list(`search=FL-${String(draftNumber).padStart(6, '0')}`)).items[0]?.id).toBe(
        ids.draft,
      );
    });

    it('serves the order form everything for one employee', async () => {
      setNow(MONDAY_MORNING);
      const { body } = await admin
        .get(`/api/orders/form-context?employeeId=${ids.olu}`)
        .expect(200);
      const context = body as OrderFormContextDto;
      expect(context.employee).toMatchObject({ name: 'Olu Fixed', canChangeDeliveryTime: false });
      expect(context.defaults.deliveryTimeMinutes).toBe(750);
      expect(context.deliveryDates[0]).toMatchObject({ date: '2027-03-01', isLocked: true });
      expect(context.deliveryDates.find((d) => d.date === SATURDAY)?.problems).toEqual([
        'OR Company doesn’t take deliveries that day.',
      ]);
      expect(context.menu.sections.some((s) => s.name === 'OR Menu')).toBe(true);
    });

    it('the kitchen role can’t see orders (prices)', async () => {
      await kitchen.get('/api/orders').expect(403);
      await kitchen.get(`/api/orders/${ids.draft}`).expect(403);
      await kitchen.get('/api/cutoffs').expect(403);
    });
  });
});
