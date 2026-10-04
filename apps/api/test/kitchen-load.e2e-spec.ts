import type { KitchenBoardDto } from '@fernleaf/shared';
import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { seedIdentity, TEST_ACCOUNT_PASSWORD } from '../prisma/seed/identity.js';
import { seedMasterData } from '../prisma/seed/master-data.js';
import { startLocalPostgres } from '../scripts/local-postgres.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import type { Env } from '../src/config/env.js';
import { CutoffService } from '../src/orders/cutoff.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { MenuService } from '../src/menu/menu.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Spec §7: "the kitchen board for a busy day (assume 400 orders) must stay responsive".
 * 456 real orders (every seeded employee, twice) for one Wednesday, confirmed by cut-off
 * processing, then the board is fetched over HTTP the way the browser does.
 */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const BUSY_DAY = '2027-07-07';

describe('Kitchen board under load (e2e)', () => {
  let database: Awaited<ReturnType<typeof startLocalPostgres>>;
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    database = await startLocalPostgres({ database: 'load_check' });
    prisma = new PrismaService({ get: () => database.url } as unknown as ConfigService<Env, true>);
    await seedIdentity(prisma);
    await seedMasterData(prisma);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    const clock = app.get(ClockService);
    const orders = app.get(OrdersService);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@test.com' },
      include: { role: true },
    });
    const actor = { id: admin.id, permissions: admin.role.permissions };
    // Every company that delivers on a Wednesday; each employee orders twice that day.
    const employees = await prisma.employee.findMany({
      where: { isActive: true, company: { isActive: true, workingDays: { has: 3 } } },
      orderBy: { email: 'asc' },
    });
    const menus = new Map<string, Awaited<ReturnType<MenuService['menuForEmployee']>>>();
    await clock.runAt(ist('2027-07-02', '10:00'), async () => {
      for (const round of [0, 1]) {
        for (const [index, employee] of employees.entries()) {
          const menu =
            menus.get(employee.companyId) ??
            (await app.get(MenuService).menuForEmployee(employee.id));
          menus.set(employee.companyId, menu);
          const dishes = menu.sections.flatMap((s) => s.dishes).filter((d) => !d.minOrderQuantity);
          const dish = dishes[(index + round * 7) % dishes.length];
          if (!dish) continue;
          const choices = dish.optionGroups
            .filter((g) => g.isRequired && g.options.length > 0)
            .map((g) => ({
              groupId: g.id,
              optionId: g.options[(index + round) % g.options.length]?.id ?? '',
              portionSizeId: g.usesPortions
                ? (g.options[(index + round) % g.options.length]?.sizes[0]?.portionSizeId ?? null)
                : null,
            }));
          await orders.create(
            {
              employeeId: employee.id,
              deliveryDate: BUSY_DAY,
              deliveryTimeMinutes: null,
              addressId: null,
              packagingTypeId: null,
              notes: '',
              place: true,
              lines: [
                { dishId: dish.dishId, quantity: 1, combinations: [{ quantity: 1, choices }] },
              ],
            },
            actor,
          );
        }
      }
    });
    await clock.runAt(ist('2027-07-05', '16:05'), () =>
      app.get(CutoffService).process(BUSY_DAY, 'MANUAL', null),
    );
  }, 600_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await database.stop();
  });

  it('serves 400+ confirmed orders on one board quickly', async () => {
    const kitchen = request.agent(app.getHttpServer());
    await kitchen
      .post('/api/auth/login')
      .send({ email: 'kitchen@test.com', password: TEST_ACCOUNT_PASSWORD })
      .expect(200);
    await kitchen.get(`/api/kitchen/board?date=${BUSY_DAY}`).expect(200); // warm-up

    const started = performance.now();
    const response = await kitchen.get(`/api/kitchen/board?date=${BUSY_DAY}`).expect(200);
    const elapsed = performance.now() - started;
    const board = response.body as KitchenBoardDto;

    expect(board.orders.length).toBeGreaterThanOrEqual(400);
    const bytes = JSON.stringify(board).length;
    console.log(
      `Kitchen board: ${board.orders.length} orders, ${board.orders.flatMap((o) => o.units).length} units, ${Math.round(bytes / 1024)} KB, ${Math.round(elapsed)} ms`,
    );
    expect(elapsed).toBeLessThan(2_000);
  });
});
