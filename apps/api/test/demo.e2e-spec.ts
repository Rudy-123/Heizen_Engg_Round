import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import { seedIdentity } from '../prisma/seed/identity.js';
import { seedMasterData } from '../prisma/seed/master-data.js';
import { startLocalPostgres } from '../scripts/local-postgres.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import type { Env } from '../src/config/env.js';
import { DemoService, type DemoWindow } from '../src/demo/demo.service.js';
import { KitchenService } from '../src/kitchen/kitchen.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * The demo simulation over the real seeded kitchen, in its own throwaway database. The clock
 * is set with ClockService.runAt, as the simulation itself does: Monday 7 June 2027, first at
 * 09:00 and then at 23:30, with a person stepping in between.
 */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const TODAY = '2027-06-07'; // a Monday
const WINDOW: DemoWindow = { pastDays: 7, futureDays: 2, volume: 0.6 };
const PAST = [
  '2027-05-31',
  '2027-06-01',
  '2027-06-02',
  '2027-06-03',
  '2027-06-04',
  '2027-06-05',
  '2027-06-06',
];

describe('Demo simulation (e2e)', () => {
  let database: Awaited<ReturnType<typeof startLocalPostgres>>;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: ClockService;
  let demo: DemoService;
  let simulatorId: string;
  const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
  const simulated = (date: string) =>
    prisma.order.findMany({
      where: { deliveryDate: day(date), createdById: simulatorId },
      include: { events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }, drop: true },
    });

  beforeAll(async () => {
    database = await startLocalPostgres({ database: 'demo_check' });
    prisma = new PrismaService({
      get: () => database.url,
    } as unknown as ConfigService<Env, true>);
    await seedIdentity(prisma);
    await seedMasterData(prisma);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    clock = app.get(ClockService);
    demo = app.get(DemoService);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await database.stop();
  });

  it('fills the past week through the real rules: delivered, on time or not, with true timelines', async () => {
    const report = await clock.runAt(ist(TODAY, '09:00'), () => demo.run(WINDOW));
    expect(report.ordersCreated).toBeGreaterThan(50);
    simulatorId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'demo.simulator@fernleaf.example' } })
    ).id;

    for (const date of PAST) {
      const orders = await simulated(date);
      expect(orders.length).toBeGreaterThan(0);
      // Every past order finished its day: delivered, or cancelled / rejected with a reason.
      for (const order of orders) {
        expect(['DELIVERED', 'CANCELLED', 'REJECTED']).toContain(order.status);
      }
      const delivered = orders.filter((o) => o.status === 'DELIVERED');
      expect(delivered.length).toBeGreaterThan(0);
      for (const order of delivered) {
        expect(order.drop?.deliveredOnTime).not.toBeNull();
        // Delivered on its own delivery date, in the kitchen's zone.
        const at = DateTime.fromJSDate(order.drop?.deliveredAt ?? new Date(0), {
          zone: 'Asia/Kolkata',
        });
        expect(at.toISODate()).toBe(date);
      }
    }

    // A delivered order's timeline reads like a real day, in order.
    const [sample] = (await simulated('2027-06-03')).filter((o) => o.status === 'DELIVERED');
    const types = sample?.events.map((e) => e.type) ?? [];
    for (const [earlier, later] of [
      ['PLACED', 'CONFIRMED'],
      ['CONFIRMED', 'KITCHEN_STARTED'],
      ['KITCHEN_STARTED', 'KITCHEN_READY'],
      ['KITCHEN_READY', 'DISPATCH_READY'],
      ['DISPATCH_READY', 'OUT_FOR_DELIVERY'],
      ['OUT_FOR_DELIVERY', 'DELIVERED'],
    ] as const) {
      expect(types.indexOf(earlier)).toBeLessThan(types.indexOf(later));
    }
    const times = sample?.events.map((e) => e.createdAt.getTime()) ?? [];
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(sample?.events[0]?.createdAt.getTime()).toBeLessThan(
      ist('2027-06-01', '16:00').getTime(),
    );

    // Some deliveries were on time and some not - honest figures, not 100%.
    const drops = await prisma.drop.findMany({
      where: { deliveryDate: { in: PAST.map(day) }, deliveredAt: { not: null } },
    });
    const onTime = drops.filter((d) => d.deliveredOnTime).length;
    expect(onTime / drops.length).toBeGreaterThan(0.5);
  }, 300_000);

  it('at 09:00 today: confirmed and not cooked yet; tomorrow confirmed; the day after still open', async () => {
    const today = await simulated(TODAY);
    expect(today.length).toBeGreaterThan(0);
    expect(today.every((o) => ['CONFIRMED', 'CANCELLED'].includes(o.status))).toBe(true);
    expect((await simulated('2027-06-08')).some((o) => o.status === 'CONFIRMED')).toBe(true);
    // Its cut-off is today at 16:00: placed orders and drafts still waiting.
    const open = await simulated('2027-06-09');
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((o) => ['PLACED', 'DRAFT', 'CANCELLED'].includes(o.status))).toBe(true);
    expect(await prisma.invoice.count()).toBe(0); // Monday's invoicing is at 11:00
  });

  it('by the evening: the day played out, a person’s order left alone, invoices issued - and a rerun changes nothing', async () => {
    // At 09:30 a cook starts a unit of one simulated order by hand.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    const touched = (await simulated(TODAY)).find(
      (o) => o.status === 'CONFIRMED' && o.drop && o.deliveryTimeMinutes >= 720,
    );
    if (!touched?.dropId) throw new Error('no confirmed order with a drop today');
    const unit = await prisma.orderLineCombination.findFirstOrThrow({
      where: { line: { orderId: touched.id } },
    });
    await clock.runAt(ist(TODAY, '09:30'), () =>
      app.get(KitchenService).start(unit.id, { id: admin.id, name: admin.name }),
    );

    await clock.runAt(ist(TODAY, '23:30'), () => demo.run(WINDOW));

    // The person's order was not moved along any further, and neither was its drop.
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: touched.id },
      include: { lines: { include: { combinations: true } }, events: true, drop: true },
    });
    expect(after.status).toBe('CONFIRMED');
    expect(after.lines.flatMap((l) => l.combinations).filter((c) => c.kitchenDoneAt)).toHaveLength(
      0,
    );
    expect(after.drop?.dispatchReadyAt).toBeNull();

    // Everything else is delivered - except the reviewer driver's drops, left out for them.
    const reviewerDriver = await prisma.user.findUniqueOrThrow({
      where: { email: 'driver@test.com' },
    });
    for (const order of await simulated(TODAY)) {
      if (order.status !== 'CONFIRMED') continue;
      const waitingForReviewer =
        order.drop?.driverId === reviewerDriver.id && order.drop.outForDeliveryAt !== null;
      expect(waitingForReviewer || order.dropId === touched.dropId).toBe(true);
    }

    // Monday 11:00: last week's deliveries were invoiced, one invoice per company, reconciled.
    const invoices = await prisma.invoice.findMany({
      include: { orders: true, adjustments: true },
    });
    expect(invoices.length).toBeGreaterThan(0);
    for (const invoice of invoices) {
      expect(invoice.status).toBe('ISSUED'); // paid on Friday
      expect(invoice.ordersTotalCents).toBe(invoice.orders.reduce((s, o) => s + o.totalCents, 0));
      expect(invoice.totalCents).toBe(
        invoice.ordersTotalCents + invoice.adjustments.reduce((s, a) => s + a.amountCents, 0),
      );
      expect(invoice.orders.every((o) => o.deliveryDate < day(TODAY))).toBe(true);
    }

    // Running again finds nothing left to do.
    const events = await prisma.orderEvent.count();
    const rerun = await clock.runAt(ist(TODAY, '23:30'), () => demo.run(WINDOW));
    expect(rerun).toEqual({
      ordersCreated: 0,
      cutoffsRun: 0,
      unitSteps: 0,
      dropSteps: 0,
      invoicesIssued: 0,
      invoicesPaid: 0,
    });
    expect(await prisma.orderEvent.count()).toBe(events);
  }, 300_000);
});
