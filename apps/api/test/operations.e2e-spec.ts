import type {
  AdminDashboardDto,
  DishDetailDto,
  DispatchBoardDto,
  DriverDayDto,
  DropDto,
  KitchenBoardDto,
  KitchenOrderDto,
  OrderDetailDto,
} from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import bcrypt from 'bcryptjs';
import type request from 'supertest';
import { vi } from 'vitest';
import { seedIdentity, TEST_ACCOUNT_PASSWORD } from '../prisma/seed/identity.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

/**
 * Kitchen board, dispatch board and the driver's view, on orders that went through the real
 * flow: placed on Monday, confirmed by cut-off processing, cooked and delivered on Wednesday
 * 7 April 2027. A 12:30 delivery with a 60-minute lead must leave the kitchen (dispatch
 * ready) by 11:30 and be cooked (kitchen ready) by 11:00.
 */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const MONDAY = '2027-04-05';
const WEDNESDAY = '2027-04-07';

describe('Kitchen, dispatch and delivery (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let kitchen: request.Agent;
  let dispatch: request.Agent;
  let driver: request.Agent;
  let otherDriver: request.Agent;
  const ids: Record<string, string> = {};

  const setNow = (now: Date) => vi.spyOn(app.get(ClockService), 'now').mockReturnValue(now);
  const board = async () =>
    (await kitchen.get(`/api/kitchen/board?date=${WEDNESDAY}`).expect(200)).body as KitchenBoardDto;
  const card = async (orderId: string | undefined) => {
    const found = (await board()).orders.find((order) => order.id === orderId);
    if (!found) throw new Error(`order ${orderId} is not on the board`);
    return found;
  };
  const unit = (order: KitchenOrderDto, dishName: string, choice?: string) => {
    const found = order.units.find(
      (u) => u.dishName === dishName && (choice === undefined || u.choices.includes(choice)),
    );
    if (!found) throw new Error(`no ${dishName} ${choice ?? ''} unit`);
    return found;
  };
  const drops = async () =>
    (await dispatch.get(`/api/dispatch/board?date=${WEDNESDAY}`).expect(200))
      .body as DispatchBoardDto;
  const dropOf = async (orderId: string | undefined) => {
    const found = (await drops()).drops.find((d) => d.orders.some((o) => o.id === orderId));
    if (!found) throw new Error(`order ${orderId} is in no drop`);
    return found;
  };

  beforeAll(async () => {
    app = await createTestApp();
    const prisma = app.get(PrismaService);
    await seedIdentity(prisma);
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');
    dispatch = await signInAs(app, 'dispatch@test.com');
    driver = await signInAs(app, 'driver@test.com');
    // A second driver - same role as the reviewer's driver account.
    const reviewerDriver = await prisma.user.findUniqueOrThrow({
      where: { email: 'driver@test.com' },
    });
    ids.driver = reviewerDriver.id;
    ids.otherDriver = (
      await prisma.user.upsert({
        where: { email: 'kd-driver@fernleaf.example' },
        create: {
          name: 'Dev Driver',
          email: 'kd-driver@fernleaf.example',
          roleId: reviewerDriver.roleId,
          passwordHash: await bcrypt.hash(TEST_ACCOUNT_PASSWORD, 4),
        },
        update: {},
      })
    ).id;
    otherDriver = await signInAs(app, 'kd-driver@fernleaf.example');

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
        atRiskMinutes: 30,
        onTimeGraceMinutes: 10,
        deliveryWindowStartMinutes: 420,
        deliveryWindowEndMinutes: 1260,
        deliverySlotMinutes: 15,
      })
      .expect(200);

    const post = async (path: string, body: object) =>
      (await admin.post(path).send(body).expect(201)).body as { id: string };
    ids.grill = (await post('/api/reference/kitchen-stations', { name: 'KD Grill' })).id;
    ids.peanut = (await post('/api/reference/allergens', { name: 'KD Peanut' })).id;
    ids.box = (await post('/api/reference/packaging-types', { name: 'KD Box' })).id;
    ids.satay = (
      await post('/api/options', { name: 'KD Satay', costCents: 40, allergenIds: [ids.peanut] })
    ).id;
    ids.plain = (await post('/api/options', { name: 'KD Plain', costCents: 10 })).id;
    const dish = (sku: string, name: string, kitchenStationId: string | null) =>
      post('/api/dishes', {
        sku,
        name,
        imageUrl: null,
        temperature: 'HOT',
        costCents: 150,
        kitchenStationId,
        minOrderQuantity: null,
      });
    ids.skewer = (await dish('KD-SKEWER', 'KD skewers', ids.grill ?? null)).id;
    ids.salad = (await dish('KD-SALAD', 'KD salad', null)).id;
    const { body: withGroups } = await admin
      .put(`/api/dishes/${ids.skewer}/option-groups`)
      .send({
        groups: [
          {
            name: 'Sauce',
            isRequired: true,
            maxSelections: 1,
            usesPortions: false,
            optionIds: [ids.satay, ids.plain],
          },
        ],
      })
      .expect(200);
    ids.sauce = (withGroups as DishDetailDto).optionGroups[0]?.id ?? '';
    ids.tier = (await post('/api/pricing/tiers', { name: 'KD Tier', ruleBasis: 'NONE' })).id;
    await admin
      .put(`/api/pricing/tiers/${ids.tier}/prices`)
      .send({
        dishes: [
          { id: ids.skewer, priceCents: 400 },
          { id: ids.salad, priceCents: 300 },
        ],
        options: [
          { id: ids.satay, priceCents: 50 },
          { id: ids.plain, priceCents: 0 },
        ],
      })
      .expect(200);
    const category = await admin.post('/api/menu/categories').send({ name: 'KD Menu' }).expect(201);
    const menuId = (category.body as { id: string; name: string }[]).find(
      (c) => c.name === 'KD Menu',
    )?.id;
    for (const dishId of [ids.skewer, ids.salad]) {
      await admin.post(`/api/menu/categories/${menuId}/items`).send({ dishId }).expect(201);
    }
    const company = await post('/api/companies', {
      name: 'KD Company',
      domain: 'kd-co.example',
      priceTierId: ids.tier,
      defaultPackagingTypeId: ids.box,
      defaultDriverId: ids.driver,
      driverInstructions: 'Call reception on arrival.',
      address: {
        label: 'KD Office',
        line1: '9 Lane',
        city: 'Pune',
        postcode: '411009',
        instructions: 'Gate 2',
      },
      billingContactName: 'Accounts',
      billingEmail: 'accounts@kd-co.example',
      billingAddress: 'Pune',
    });
    const employee = async (firstName: string, extra: object) =>
      (
        await post('/api/employees', {
          companyId: company.id,
          firstName,
          lastName: 'Kd',
          email: `${firstName.toLowerCase()}@kd-co.example`,
          ...extra,
        })
      ).id;
    ids.kai = await employee('Kai', { allergenIds: [ids.peanut] });
    ids.kim = await employee('Kim', { canChangeDeliveryTime: true });

    const skewers = (satay: number, plain: number) => ({
      dishId: ids.skewer,
      quantity: satay + plain,
      combinations: [
        { quantity: satay, choices: [{ groupId: ids.sauce, optionId: ids.satay }] },
        { quantity: plain, choices: [{ groupId: ids.sauce, optionId: ids.plain }] },
      ].filter((c) => c.quantity > 0),
    });
    const salads = (quantity: number) => ({
      dishId: ids.salad,
      quantity,
      combinations: [{ quantity, choices: [] }],
    });
    const place = async (employeeId: string | undefined, lines: object[], extra: object = {}) =>
      (
        (
          await admin
            .post('/api/orders')
            .send({ employeeId, deliveryDate: WEDNESDAY, lines, place: true, ...extra })
            .expect(201)
        ).body as OrderDetailDto
      ).id;

    setNow(ist(MONDAY, '10:00'));
    ids.kaiOrder = await place(ids.kai, [skewers(2, 1), salads(1)]);
    ids.kimOrder = await place(ids.kim, [skewers(0, 2)]);
    ids.kimLater = await place(ids.kim, [salads(2)], { deliveryTimeMinutes: 810 });
    // Monday 16:00 is the cut-off; processing confirms the three orders.
    setNow(ist(MONDAY, '16:30'));
    await admin.post(`/api/cutoffs/${WEDNESDAY}/run`).expect(200);
    // An admin places one more after the cut-off: it waits for the next run.
    ids.lateOrder = await place(ids.kai, [salads(1)]);
    setNow(ist(WEDNESDAY, '10:00'));
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  describe('kitchen board', () => {
    it('shows confirmed orders as prep units by station, with allergy warnings and no money', async () => {
      const today = await board();
      const kai = await card(ids.kaiOrder);
      expect(kai).toMatchObject({
        employeeName: 'Kai Kd',
        companyName: 'KD Company',
        risk: 'ON_TRACK',
        plannedDispatchReadyAt: ist(WEDNESDAY, '11:30').toISOString(),
        plannedKitchenReadyAt: ist(WEDNESDAY, '11:00').toISOString(),
      });
      // One unit per combination; the salad has no station, so it is "Unassigned".
      expect(
        kai.units.map((u) => [u.dishName, u.quantity, u.choices, u.stationId, u.allergyConflicts]),
      ).toEqual(
        expect.arrayContaining([
          ['KD skewers', 2, ['KD Satay'], ids.grill, ['KD Peanut']],
          ['KD skewers', 1, ['KD Plain'], ids.grill, []],
          ['KD salad', 1, [], null, []],
        ]),
      );
      expect(kai.units).toHaveLength(3);
      expect(today.stations.find((s) => s.id === ids.grill)).toMatchObject({
        name: 'KD Grill',
        units: 3,
        meals: 5,
        notStarted: 3,
      });
      expect(today.stations.find((s) => s.id === null)).toMatchObject({
        name: 'Unassigned',
        units: 2,
        meals: 3,
      });
      expect(today.production.find((p) => p.dishName === 'KD skewers')).toMatchObject({
        meals: 5,
        combinations: [
          { choices: ['KD Plain'], meals: 3 },
          { choices: ['KD Satay'], meals: 2 },
        ],
      });
      // The placed-but-not-confirmed order isn't on the board, only counted.
      expect(today.orders.map((o) => o.id)).not.toContain(ids.lateOrder);
      expect(today.awaitingConfirmation).toEqual({ orders: 1, meals: 1 });
      expect(JSON.stringify(today)).not.toMatch(/Cents/);
    });

    it('only confirmed orders can be worked on', async () => {
      const prisma = app.get(PrismaService);
      const placedUnit = await prisma.orderLineCombination.findFirstOrThrow({
        where: { line: { orderId: ids.lateOrder } },
      });
      const { body } = await kitchen.post(`/api/kitchen/units/${placedUnit.id}/start`).expect(422);
      expect(body.code).toBe('ORDER_NOT_CONFIRMED');
    });

    it('a unit starts once and finishes once; finishing an unstarted unit records its start', async () => {
      const kai = await card(ids.kaiOrder);
      const satay = unit(kai, 'KD skewers', 'KD Satay');
      const plain = unit(kai, 'KD skewers', 'KD Plain');

      const started = (await kitchen.post(`/api/kitchen/units/${satay.id}/start`).expect(200))
        .body as KitchenOrderDto;
      expect(started.kitchenStartedAt).toBe(ist(WEDNESDAY, '10:00').toISOString());
      const again = await kitchen.post(`/api/kitchen/units/${satay.id}/start`).expect(409);
      expect(again.body.message).toMatch(/^Already started by Rahul Verma at 10:00\.$/);

      setNow(ist(WEDNESDAY, '10:05'));
      const done = (await kitchen.post(`/api/kitchen/units/${plain.id}/done`).expect(200))
        .body as KitchenOrderDto;
      const plainNow = unit(done, 'KD skewers', 'KD Plain');
      expect(plainNow.startedAt).toBe(ist(WEDNESDAY, '10:05').toISOString());
      expect(plainNow.doneAt).toBe(plainNow.startedAt);
      // "Kitchen started" stays the first unit's start; not ready while units are open.
      expect(done.kitchenStartedAt).toBe(ist(WEDNESDAY, '10:00').toISOString());
      expect(done.kitchenReadyAt).toBeNull();
      await kitchen.post(`/api/kitchen/units/${plain.id}/done`).expect(409);
    });

    it('a drop can’t be dispatch ready while its orders are still in the kitchen', async () => {
      const drop = await dropOf(ids.kaiOrder);
      expect(drop.stage).toBe('AWAITING_KITCHEN');
      const { body } = await dispatch
        .post(`/api/dispatch/drops/${drop.id}/dispatch-ready`)
        .expect(422);
      expect(body.message).toBe('2 of its 2 orders are still in the kitchen.');
    });

    it('two people finishing the last two units at once: "kitchen ready" is set exactly once', async () => {
      const kai = await card(ids.kaiOrder);
      const [first, second] = await Promise.all([
        kitchen.post(`/api/kitchen/units/${unit(kai, 'KD skewers', 'KD Satay').id}/done`),
        admin.post(`/api/kitchen/units/${unit(kai, 'KD salad').id}/done`),
      ]);
      expect([first.status, second.status]).toEqual([200, 200]);
      const { body } = await admin.get(`/api/orders/${ids.kaiOrder}`).expect(200);
      const order = body as OrderDetailDto;
      expect(order.kitchenReadyAt).toBe(ist(WEDNESDAY, '10:05').toISOString());
      expect(order.events.filter((e) => e.type === 'KITCHEN_READY')).toHaveLength(1);
      expect(order.events.filter((e) => e.type === 'KITCHEN_STARTED')).toHaveLength(1);
    });

    it('two people finishing the same unit at once: one wins, the other is told', async () => {
      const kim = await card(ids.kimOrder);
      const only = unit(kim, 'KD skewers');
      const results = await Promise.all([
        kitchen.post(`/api/kitchen/units/${only.id}/done`),
        admin.post(`/api/kitchen/units/${only.id}/done`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await card(ids.kimOrder)).risk).toBe('READY');
    });

    it('makes late and at-risk work obvious', async () => {
      // The 13:30 delivery must be cooked by 12:00.
      setNow(ist(WEDNESDAY, '11:29'));
      expect((await card(ids.kimLater)).risk).toBe('ON_TRACK');
      setNow(ist(WEDNESDAY, '11:30'));
      expect((await card(ids.kimLater)).risk).toBe('AT_RISK');
      setNow(ist(WEDNESDAY, '12:01'));
      expect((await card(ids.kimLater)).risk).toBe('LATE');
      setNow(ist(WEDNESDAY, '10:10'));
    });

    it('only an admin can force-complete a whole order', async () => {
      await kitchen.post(`/api/kitchen/orders/${ids.kimLater}/force-complete`).expect(403);
      const forced = (
        await admin.post(`/api/kitchen/orders/${ids.kimLater}/force-complete`).expect(200)
      ).body as KitchenOrderDto;
      expect(forced.risk).toBe('READY');
      expect(forced.units.every((u) => u.startedAt && u.doneAt)).toBe(true);
      await admin.post(`/api/kitchen/orders/${ids.kimLater}/force-complete`).expect(409);
    });

    it('dispatch can read the board but not work on it; drivers can’t see it', async () => {
      const kai = await card(ids.kaiOrder);
      await dispatch.get(`/api/kitchen/board?date=${WEDNESDAY}`).expect(200);
      await dispatch.post(`/api/kitchen/units/${kai.units[0]?.id}/start`).expect(403);
      await driver.get(`/api/kitchen/board?date=${WEDNESDAY}`).expect(403);
    });
  });

  describe('dispatch', () => {
    it('groups orders for the same company, address and time into one drop', async () => {
      const board = await drops();
      const noon = await dropOf(ids.kaiOrder);
      expect(noon.orders.map((o) => o.id).sort()).toEqual([ids.kaiOrder, ids.kimOrder].sort());
      expect(noon).toMatchObject({
        stage: 'KITCHEN_READY',
        deliveryTimeMinutes: 750,
        meals: 6,
        ordersReady: 2,
        driver: { id: ids.driver, name: 'Vikram Singh' }, // the company's default driver
        instructions: ['Call reception on arrival.', 'Gate 2'],
        plannedDispatchReadyAt: ist(WEDNESDAY, '11:30').toISOString(),
        lateLeaving: false,
      });
      expect((await dropOf(ids.kimLater)).id).not.toBe(noon.id);
      expect(board.drivers.map((d) => d.id)).toEqual(
        expect.arrayContaining([ids.driver, ids.otherDriver]),
      );
    });

    it('each step needs the one before and happens once', async () => {
      const noon = await dropOf(ids.kaiOrder);
      const step = (name: string) => dispatch.post(`/api/dispatch/drops/${noon.id}/${name}`);
      expect((await step('out-for-delivery').expect(422)).body.message).toBe(
        'Mark it dispatch ready first.',
      );
      const ready = (await step('dispatch-ready').expect(200)).body as DropDto;
      expect(ready.stage).toBe('DISPATCH_READY');
      expect((await step('dispatch-ready').expect(409)).body.code).toBe('STEP_REPEATED');
    });

    it('a drop that gains an order after it was packed goes back to packing', async () => {
      // The next cut-off run confirms the late order; it travels with Kai's 12:30 drop.
      await admin.post(`/api/cutoffs/${WEDNESDAY}/run`).expect(200);
      const reopened = await dropOf(ids.lateOrder);
      expect(reopened.orders).toHaveLength(3);
      expect(reopened).toMatchObject({ stage: 'AWAITING_KITCHEN', dispatchReadyAt: null });

      const late = await card(ids.lateOrder);
      await kitchen.post(`/api/kitchen/units/${late.units[0]?.id}/done`).expect(200);
      await dispatch.post(`/api/dispatch/drops/${reopened.id}/dispatch-ready`).expect(200);
    });

    it('out for delivery needs a driver; the driver can’t change once it has left', async () => {
      const noon = await dropOf(ids.kaiOrder);
      const driverOf = (driverId: string | null) =>
        dispatch.put(`/api/dispatch/drops/${noon.id}/driver`).send({ driverId });
      await driverOf(null).expect(200);
      const out = () => dispatch.post(`/api/dispatch/drops/${noon.id}/out-for-delivery`);
      expect((await out().expect(422)).body.message).toBe('Assign a driver first.');
      // Only people who can take deliveries can be given a drop.
      const kitchenUser = await app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { email: 'kitchen@test.com' } });
      expect((await driverOf(kitchenUser.id).expect(422)).body.code).toBe('NOT_A_DRIVER');

      await driverOf(ids.otherDriver ?? null).expect(200);
      setNow(ist(WEDNESDAY, '11:40'));
      const left = (await out().expect(200)).body as DropDto;
      expect(left).toMatchObject({ stage: 'OUT_FOR_DELIVERY', lateLeaving: false });
      expect((await driverOf(ids.driver ?? null).expect(409)).body.code).toBe('DROP_LEFT');
      await out().expect(409);
    });
  });

  describe('driver view', () => {
    it('a driver sees only their own drops for today, in time order', async () => {
      const mine = (await driver.get('/api/driver/today').expect(200)).body as DriverDayDto;
      expect(mine.date).toBe(WEDNESDAY);
      expect(mine.drops.map((d) => d.id)).toEqual([(await dropOf(ids.kimLater)).id]);
      const theirs = (await otherDriver.get('/api/driver/today').expect(200)).body as DriverDayDto;
      expect(theirs.drops.map((d) => d.id)).toEqual([(await dropOf(ids.kaiOrder)).id]);
      // Another day: nothing.
      setNow(ist('2027-04-08', '11:40'));
      expect(
        ((await otherDriver.get('/api/driver/today').expect(200)).body as DriverDayDto).drops,
      ).toEqual([]);
      setNow(ist(WEDNESDAY, '11:40'));
    });

    it('a driver can only deliver their own drop, once it is out', async () => {
      const noon = await dropOf(ids.kaiOrder);
      const later = await dropOf(ids.kimLater);
      await driver.post(`/api/driver/drops/${noon.id}/deliver`).send({}).expect(404);
      expect(
        (await driver.post(`/api/driver/drops/${later.id}/deliver`).send({}).expect(422)).body
          .message,
      ).toBe('It hasn’t gone out for delivery yet.');
      // Dispatch moves drops but doesn't mark them delivered.
      await dispatch.post(`/api/dispatch/drops/${noon.id}/deliver`).send({}).expect(403);
    });

    it('delivering with a note and photo delivers every order and records on time', async () => {
      const noon = await dropOf(ids.kaiOrder);
      // ~300 KB photo: bigger than the default 100 KB body limit.
      const photo = Buffer.alloc(300_000, 7).toString('base64');
      setNow(ist(WEDNESDAY, '12:38'));
      const delivered = (
        await otherDriver
          .post(`/api/driver/drops/${noon.id}/deliver`)
          .send({
            note: 'Left with reception',
            photo: { mimeType: 'image/jpeg', dataBase64: photo },
          })
          .expect(200)
      ).body as DropDto;
      expect(delivered).toMatchObject({
        stage: 'DELIVERED',
        deliveredOnTime: true, // 12:38 is within 10 minutes of 12:30
        deliveryNote: 'Left with reception',
        hasPhoto: true,
      });
      expect(delivered.orders.every((o) => o.status === 'DELIVERED')).toBe(true);
      const { body: kai } = await admin.get(`/api/orders/${ids.kaiOrder}`).expect(200);
      expect(kai.status).toBe('DELIVERED');
      expect((kai as OrderDetailDto).events.at(-1)?.message).toMatch(
        /^Delivered by Dev Driver, on time\. Note: “Left with reception”\. Photo attached\.$/,
      );
      await otherDriver.post(`/api/driver/drops/${noon.id}/deliver`).send({}).expect(409);
      const image = await dispatch.get(`/api/dispatch/drops/${noon.id}/photo`).expect(200);
      expect(image.headers['content-type']).toBe('image/jpeg');
      expect((image.body as Buffer).length).toBe(300_000);
    });

    it('an admin can deliver any drop; a late delivery is recorded as not on time', async () => {
      const later = await dropOf(ids.kimLater);
      await dispatch.post(`/api/dispatch/drops/${later.id}/dispatch-ready`).expect(200);
      setNow(ist(WEDNESDAY, '12:50'));
      await dispatch.post(`/api/dispatch/drops/${later.id}/out-for-delivery`).expect(200);
      setNow(ist(WEDNESDAY, '13:41')); // due 13:30, grace 10 minutes
      const delivered = (
        await admin.post(`/api/dispatch/drops/${later.id}/deliver`).send({}).expect(200)
      ).body as DropDto;
      expect(delivered).toMatchObject({ stage: 'DELIVERED', deliveredOnTime: false });
      const day = (await driver.get('/api/driver/today').expect(200)).body as DriverDayDto;
      expect(day.drops[0]?.stage).toBe('DELIVERED');
    });
  });

  describe('admin dashboard', () => {
    it('sums the day from the same orders and drops the boards show', async () => {
      const { body } = await admin.get('/api/dashboard/admin').expect(200);
      const dashboard = body as AdminDashboardDto;
      expect(dashboard.date).toBe(WEDNESDAY);
      // Kai 4 + Kim 2 + Kim later 2 + the late order 1 - all delivered.
      expect(dashboard.today).toMatchObject({
        orders: 4,
        meals: 9,
        mealsDelivered: 9,
        dropsTotal: 2,
        dropsDelivered: 2,
        dropsOnTime: 1,
        kitchenLate: 0,
        dropsLate: 0,
        placedWaiting: 0,
      });
      expect(dashboard.week[0]).toMatchObject({ date: WEDNESDAY, confirmedMeals: 9 });
      // It's Wednesday 13:41: the next lock is Friday's delivery, today at 16:00.
      expect(dashboard.nextCutoff).toMatchObject({
        deliveryDate: '2027-04-09',
        cutoffAt: ist(WEDNESDAY, '16:00').toISOString(),
      });
      expect(dashboard.billing).not.toBeNull();
      expect(dashboard.dataHealth).not.toBeNull();
    });

    it('is only for people who can read orders', async () => {
      await kitchen.get('/api/dashboard/admin').expect(403);
      await driver.get('/api/dashboard/admin').expect(403);
    });
  });
});
