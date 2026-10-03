import type {
  BillingOverviewDto,
  CompanyBillingDto,
  CreditDto,
  InvoiceDetailDto,
  OrderDetailDto,
} from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import { vi } from 'vitest';
import { seedIdentity } from '../prisma/seed/identity.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

/**
 * Company billing (spec 4.9) on orders confirmed by real cut-off processing: invoices,
 * the one-invoice-per-order rule under a race, payment, and the post-invoice credit policy.
 * Wednesday 5 May 2027 deliveries lock on Monday 3 May at 16:00.
 */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const MONDAY = '2027-05-03';
const WEDNESDAY = '2027-05-05';
const PRICE = 450; // one BL thali

describe('Billing (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let kitchen: request.Agent;
  const ids: Record<string, string> = {};

  const setNow = (now: Date) => vi.spyOn(app.get(ClockService), 'now').mockReturnValue(now);
  const billing = async (companyId: string | undefined) =>
    (await admin.get(`/api/billing/companies/${companyId}`).expect(200)).body as CompanyBillingDto;
  const order = async (id: string | undefined) =>
    (await admin.get(`/api/orders/${id}`).expect(200)).body as OrderDetailDto;
  const invoice = (companyId: string | undefined, orderIds: (string | undefined)[]) =>
    admin.post('/api/billing/invoices').send({ companyId, orderIds });

  beforeAll(async () => {
    app = await createTestApp();
    await seedIdentity(app.get(PrismaService));
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');

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
      })
      .expect(200);

    const post = async (path: string, body: object) =>
      (await admin.post(path).send(body).expect(201)).body as { id: string };
    const box = await post('/api/reference/packaging-types', { name: 'BL Box' });
    ids.thali = (
      await post('/api/dishes', {
        sku: 'BL-THALI',
        name: 'BL thali',
        imageUrl: null,
        temperature: 'HOT',
        costCents: 200,
        kitchenStationId: null,
        minOrderQuantity: null,
      })
    ).id;
    ids.tier = (await post('/api/pricing/tiers', { name: 'BL Tier', ruleBasis: 'NONE' })).id;
    await admin
      .put(`/api/pricing/tiers/${ids.tier}/prices`)
      .send({ dishes: [{ id: ids.thali, priceCents: PRICE }], options: [] })
      .expect(200);
    const category = await admin.post('/api/menu/categories').send({ name: 'BL Menu' }).expect(201);
    const menuId = (category.body as { id: string; name: string }[]).find(
      (c) => c.name === 'BL Menu',
    )?.id;
    await admin
      .post(`/api/menu/categories/${menuId}/items`)
      .send({ dishId: ids.thali })
      .expect(201);
    const company = (name: string, domain: string) =>
      post('/api/companies', {
        name,
        domain,
        priceTierId: ids.tier,
        defaultPackagingTypeId: box.id,
        address: { label: 'Office', line1: '1 Road', city: 'Pune', postcode: '411001' },
        billingContactName: 'Accounts',
        billingEmail: `accounts@${domain}`,
        billingAddress: 'Pune',
      });
    ids.company = (await company('BL Company', 'bl-co.example')).id;
    ids.other = (await company('BL Other', 'bl-other.example')).id;
    const employee = async (companyId: string | undefined, email: string) =>
      (await post('/api/employees', { companyId, firstName: 'Bo', lastName: 'Bill', email })).id;
    ids.bo = await employee(ids.company, 'bo@bl-co.example');
    ids.ola = await employee(ids.other, 'ola@bl-other.example');

    const place = async (employeeId: string | undefined, meals: number, place = true) =>
      (
        (
          await admin
            .post('/api/orders')
            .send({
              employeeId,
              deliveryDate: WEDNESDAY,
              place,
              lines: [
                {
                  dishId: ids.thali,
                  quantity: meals,
                  combinations: [{ quantity: meals, choices: [] }],
                },
              ],
            })
            .expect(201)
        ).body as OrderDetailDto
      ).id;
    setNow(ist(MONDAY, '10:00'));
    ids.a = await place(ids.bo, 2);
    ids.b = await place(ids.bo, 3);
    ids.c = await place(ids.bo, 1);
    ids.cancelledEarly = await place(ids.bo, 4);
    ids.draft = await place(ids.bo, 5, false);
    ids.otherOrder = await place(ids.ola, 1);
    const { version } = await order(ids.cancelledEarly);
    await admin
      .post(`/api/orders/${ids.cancelledEarly}/cancel`)
      .send({ version, reason: 'Not needed' })
      .expect(200);
    // Monday 16:00 cut-off: drafts are cancelled, placed orders confirmed - and billable.
    setNow(ist(MONDAY, '16:30'));
    await admin.post(`/api/cutoffs/${WEDNESDAY}/run`).expect(200);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('only confirmed orders not yet on an invoice are billable', async () => {
    const before = await billing(ids.company);
    expect(before.orders.map((o) => o.id).sort()).toEqual([ids.a, ids.b, ids.c].sort());
    expect(before.orders.find((o) => o.id === ids.b)).toMatchObject({
      status: 'CONFIRMED',
      mealCount: 3,
      totalCents: 3 * PRICE,
      deliveryDate: WEDNESDAY,
    });
    const { body } = await admin.get('/api/billing/overview').expect(200);
    expect(
      (body as BillingOverviewDto).companies.find((c) => c.company.id === ids.company),
    ).toMatchObject({
      uninvoicedOrders: 3,
      uninvoicedCents: 6 * PRICE,
      oldestUninvoicedDate: WEDNESDAY,
    });
  });

  it('a short-delivery credit is checked against what is left of the order', async () => {
    const tooMuch = await admin
      .post('/api/billing/credits')
      .send({
        orderId: ids.a,
        amountCents: 2 * PRICE + 5,
        reason: 'SHORT_DELIVERY',
        note: 'One box missing',
      })
      .expect(422);
    expect(tooMuch.body.fieldErrors[0]).toMatchObject({ path: 'amountCents' });
    const { body } = await admin
      .post('/api/billing/credits')
      .send({
        orderId: ids.a,
        amountCents: PRICE,
        reason: 'SHORT_DELIVERY',
        note: 'One box missing',
      })
      .expect(201);
    expect(body as CreditDto).toMatchObject({
      amountCents: -PRICE,
      reason: 'SHORT_DELIVERY',
      invoice: null,
    });
    expect((await order(ids.a)).events.at(-1)?.type).toBe('CREDITED');
    await admin
      .post('/api/billing/credits')
      .send({ orderId: ids.cancelledEarly, amountCents: 100, reason: 'OTHER', note: 'x' })
      .expect(422);
  });

  it('an invoice holds the chosen orders and every pending credit, and reconciles', async () => {
    const { body } = await invoice(ids.company, [ids.a, ids.b]).expect(201);
    const issued = body as InvoiceDetailDto;
    ids.invoice = issued.id;
    expect(issued).toMatchObject({
      status: 'ISSUED',
      orderCount: 2,
      ordersTotalCents: 5 * PRICE,
      adjustmentsTotalCents: -PRICE,
      totalCents: 4 * PRICE,
      periodStart: WEDNESDAY,
      periodEnd: WEDNESDAY,
      billTo: { email: 'accounts@bl-co.example' },
    });
    expect(issued.adjustments.map((a) => a.amountCents)).toEqual([-PRICE]);
    const a = await order(ids.a);
    expect(a.isInvoiced).toBe(true);
    expect(a.events.find((e) => e.type === 'INVOICED')?.message).toMatch(
      /^Invoiced on INV-\d{4}\.$/,
    );
    const left = await billing(ids.company);
    expect(left.orders.map((o) => o.id)).toEqual([ids.c]);
    expect(left.pendingCredits).toEqual([]);
  });

  it('an order can only be on one invoice - even when two people invoice it at once', async () => {
    const results = await Promise.all([
      invoice(ids.company, [ids.c]),
      invoice(ids.company, [ids.c]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    await invoice(ids.company, [ids.a]).expect(409);
    // Not billable: a draft (cancelled at cut-off), and another company's order.
    await invoice(ids.company, [ids.draft]).expect(422);
    await invoice(ids.company, [ids.otherOrder]).expect(422);
    await invoice(ids.company, []).expect(422);
  });

  it('an invoice is marked paid once', async () => {
    const { body } = await admin.post(`/api/billing/invoices/${ids.invoice}/pay`).expect(200);
    expect(body).toMatchObject({ status: 'PAID' });
    expect((body as InvoiceDetailDto).paidAt).not.toBeNull();
    await admin.post(`/api/billing/invoices/${ids.invoice}/pay`).expect(409);
  });

  it('cancelling an invoiced order leaves the invoice alone and credits the rest on the next one', async () => {
    const a = await order(ids.a);
    await admin
      .post(`/api/orders/${ids.a}/cancel`)
      .send({ version: a.version, reason: 'Office closed' })
      .expect(200);
    const paid = (await admin.get(`/api/billing/invoices/${ids.invoice}`).expect(200))
      .body as InvoiceDetailDto;
    expect(paid).toMatchObject({ status: 'PAID', totalCents: 4 * PRICE, orderCount: 2 });
    // 2 meals, one already credited: only the other one is credited now.
    const pending = (await billing(ids.company)).pendingCredits;
    expect(pending.map((c) => [c.reason, c.amountCents])).toEqual([
      ['CANCELLED_AFTER_INVOICE', -PRICE],
    ]);
    // With nothing new to bill, the next invoice is a credit note.
    const { body } = await invoice(ids.company, []).expect(201);
    expect(body).toMatchObject({ orderCount: 0, ordersTotalCents: 0, totalCents: -PRICE });
  });

  it('the kitchen sees no billing', async () => {
    await kitchen.get('/api/billing/overview').expect(403);
    await kitchen
      .post('/api/billing/invoices')
      .send({ companyId: ids.company, orderIds: [] })
      .expect(403);
  });
});
