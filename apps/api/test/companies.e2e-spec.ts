import type { CompanyDetailDto, EmployeeDto, Page } from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import { seedIdentity } from '../prisma/seed/identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

const address = { label: 'Head office', line1: '1 MG Road', city: 'Pune', postcode: '411001' };

function company(name: string, domain: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    domain,
    address,
    billingContactName: 'Accounts team',
    billingEmail: `accounts@${domain}`,
    billingAddress: '1 MG Road, Pune',
    ...extra,
  };
}

describe('Companies and employees (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let kitchen: request.Agent;
  let dispatch: request.Agent;
  let acme: CompanyDetailDto;
  let globex: CompanyDetailDto;
  const ids: Record<string, string> = {};

  function details(c: CompanyDetailDto, changes: Record<string, unknown> = {}) {
    return {
      name: c.name,
      billingContactName: c.billingContactName,
      billingEmail: c.billingEmail,
      billingPhone: c.billingPhone,
      billingAddress: c.billingAddress,
      priceTierId: c.priceTierId,
      workingDays: c.workingDays,
      defaultDeliveryTimeMinutes: c.defaultDeliveryTimeMinutes,
      deliveryLeadMinutes: c.deliveryLeadMinutes,
      defaultPackagingTypeId: c.defaultPackagingTypeId,
      driverInstructions: c.driverInstructions,
      defaultDriverId: c.defaultDriverId,
      ownerEmployeeId: c.ownerEmployeeId,
      isActive: c.isActive,
      ...changes,
    };
  }

  function employee(companyId: string, email: string, extra: Record<string, unknown> = {}) {
    return { companyId, firstName: 'Asha', lastName: 'Rao', email, ...extra };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await seedIdentity(app.get(PrismaService));
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');
    dispatch = await signInAs(app, 'dispatch@test.com');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('companies', () => {
    it('starts a company with one domain and one default address, and the spec defaults', async () => {
      const { body } = await admin
        .post('/api/companies')
        .send(company('Acme Foods', 'ACME.example'))
        .expect(201);
      acme = body as CompanyDetailDto;
      expect(acme).toMatchObject({
        domains: [{ domain: 'acme.example', employeeCount: 0 }],
        addresses: [{ label: 'Head office', isDefault: true, isActive: true }],
        workingDays: [1, 2, 3, 4, 5],
        defaultDeliveryTimeMinutes: 750,
        deliveryLeadMinutes: 60,
        ownerEmployeeId: null,
      });
      globex = (
        await admin.post('/api/companies').send(company('Globex', 'globex.example')).expect(201)
      ).body as CompanyDetailDto;
    });

    it('refuses public email domains and domains another company owns', async () => {
      const gmail = await admin
        .post('/api/companies')
        .send(company('Gmail Co', 'gmail.com'))
        .expect(422);
      expect(gmail.body).toMatchObject({
        code: 'PUBLIC_EMAIL_DOMAIN',
        fieldErrors: [{ path: 'domain' }],
      });

      const taken = await admin
        .post(`/api/companies/${globex.id}/domains`)
        .send({ domain: 'acme.example' })
        .expect(422);
      expect(taken.body).toMatchObject({
        code: 'DOMAIN_TAKEN',
        message: 'acme.example already belongs to Acme Foods.',
      });
    });

    it('checks the delivery defaults: a bookable time and a driver who delivers', async () => {
      const offGrid = await admin
        .put(`/api/companies/${acme.id}`)
        .send(details(acme, { defaultDeliveryTimeMinutes: 752 }))
        .expect(422);
      expect(offGrid.body.fieldErrors).toEqual([
        {
          path: 'defaultDeliveryTimeMinutes',
          message: 'Pick a time on the 15-minute grid (07:00–21:00).',
        },
      ]);

      const users = await app.get(PrismaService).user.findMany();
      const kitchenUser = users.find((u) => u.email === 'kitchen@test.com');
      const notADriver = await admin
        .put(`/api/companies/${acme.id}`)
        .send(details(acme, { defaultDriverId: kitchenUser?.id }))
        .expect(422);
      expect(notADriver.body.fieldErrors).toMatchObject([{ path: 'defaultDriverId' }]);

      const { body: drivers } = await admin.get('/api/companies/driver-options').expect(200);
      expect(drivers.map((d: { name: string }) => d.name)).toContain('Vikram Singh');
      const saved = await admin
        .put(`/api/companies/${acme.id}`)
        .send(
          details(acme, {
            defaultDriverId: drivers[0].id,
            defaultDeliveryTimeMinutes: 780,
            workingDays: [6, 1, 2, 2],
          }),
        )
        .expect(200);
      expect(saved.body).toMatchObject({ defaultDeliveryTimeMinutes: 780, workingDays: [1, 2, 6] });
      acme = saved.body;
    });

    it('keeps exactly one default address and never switches the default off', async () => {
      const { body } = await admin
        .post(`/api/companies/${acme.id}/addresses`)
        .send({ ...address, label: 'Warehouse' })
        .expect(201);
      const warehouse = (body as CompanyDetailDto).addresses.find((a) => a.label === 'Warehouse');
      const head = (body as CompanyDetailDto).addresses.find((a) => a.label === 'Head office');
      expect(warehouse?.isDefault).toBe(false);

      await admin
        .put(`/api/companies/${acme.id}/addresses/${head?.id}`)
        .send({ ...address, isActive: false })
        .expect(422);

      const moved = await admin
        .post(`/api/companies/${acme.id}/addresses/${warehouse?.id}/make-default`)
        .expect(200);
      expect(
        (moved.body as CompanyDetailDto).addresses.filter((a) => a.isDefault).map((a) => a.label),
      ).toEqual(['Warehouse']);
    });

    it('adds and removes company holidays; one per date', async () => {
      const { body } = await admin
        .post(`/api/companies/${acme.id}/holidays`)
        .send({ date: '2026-12-25', name: 'Office closed' })
        .expect(201);
      const holiday = (body as CompanyDetailDto).holidays[0];
      expect(holiday).toMatchObject({ date: '2026-12-25', name: 'Office closed' });
      await admin
        .post(`/api/companies/${acme.id}/holidays`)
        .send({ date: '2026-12-25', name: 'Again' })
        .expect(409);
      const removed = await admin
        .delete(`/api/companies/${acme.id}/holidays/${holiday?.id}`)
        .expect(200);
      expect(removed.body.holidays).toEqual([]);
    });
  });

  describe('employees', () => {
    it('only takes emails on one of the company’s domains, each email once', async () => {
      const wrong = await admin
        .post('/api/employees')
        .send(employee(acme.id, 'asha@gmail.com'))
        .expect(422);
      expect(wrong.body).toMatchObject({
        code: 'EMAIL_NOT_COMPANY_DOMAIN',
        fieldErrors: [
          { path: 'email', message: "Use an email on Acme Foods's domain: acme.example." },
        ],
      });

      const { body } = await admin
        .post('/api/employees')
        .send(employee(acme.id, 'Asha.Rao@ACME.example', { canChooseAddress: true }))
        .expect(201);
      ids.asha = body.id;
      expect(body).toMatchObject({ email: 'asha.rao@acme.example', canChooseAddress: true });

      const clash = await admin
        .post('/api/employees')
        .send(employee(acme.id, 'asha.rao@acme.example'))
        .expect(422);
      expect(clash.body.code).toBe('EMAIL_TAKEN');
    });

    it('lists employees a page at a time, with search', async () => {
      for (let i = 0; i < 4; i += 1) {
        await admin
          .post('/api/employees')
          .send(employee(acme.id, `person${i}@acme.example`, { lastName: `Zed${i}` }))
          .expect(201);
      }
      const page = await admin
        .get(`/api/employees?companyId=${acme.id}&page=2&pageSize=2`)
        .expect(200);
      expect(page.body).toMatchObject({ total: 5, page: 2, pageSize: 2 });
      expect((page.body as Page<EmployeeDto>).items).toHaveLength(2);

      const search = await admin.get(`/api/employees?companyId=${acme.id}&search=zed3`).expect(200);
      expect((search.body as Page<EmployeeDto>).items.map((e) => e.lastName)).toEqual(['Zed3']);
    });

    it('the owner must be one of the company’s own active employees', async () => {
      const outsider = await admin
        .post('/api/employees')
        .send(employee(globex.id, 'gil@globex.example'))
        .expect(201);
      ids.gil = outsider.body.id;

      const refused = await admin
        .put(`/api/companies/${acme.id}`)
        .send(details(acme, { ownerEmployeeId: ids.gil }))
        .expect(422);
      expect(refused.body.fieldErrors).toEqual([
        {
          path: 'ownerEmployeeId',
          message: 'The owner must be an active employee of this company.',
        },
      ]);

      const saved = await admin
        .put(`/api/companies/${acme.id}`)
        .send(details(acme, { ownerEmployeeId: ids.asha }))
        .expect(200);
      expect(saved.body.owner).toMatchObject({ id: ids.asha, name: 'Asha Rao' });
      acme = saved.body;
    });

    it('an owner can’t be moved to another company or switched off', async () => {
      const move = await admin
        .put(`/api/employees/${ids.asha}`)
        .send(employee(globex.id, 'asha@globex.example'))
        .expect(422);
      expect(move.body.code).toBe('OWNER_CANNOT_MOVE');
      const off = await admin
        .put(`/api/employees/${ids.asha}`)
        .send(employee(acme.id, 'asha.rao@acme.example', { isActive: false }))
        .expect(422);
      expect(off.body.code).toBe('OWNER_CANNOT_DEACTIVATE');
    });

    it('moves an employee to another company, with an email on the new domain', async () => {
      const moved = await admin
        .put(`/api/employees/${ids.gil}`)
        .send(employee(acme.id, 'gil@acme.example', { firstName: 'Gil' }))
        .expect(200);
      expect(moved.body.company).toEqual({ id: acme.id, name: 'Acme Foods' });
    });

    it('a domain can’t be removed while employees use it, nor the last one', async () => {
      const inUse = await admin
        .delete(`/api/companies/${acme.id}/domains/${acme.domains[0]?.id}`)
        .expect(422);
      expect(inUse.body.code).toBe('LAST_DOMAIN');

      const added = await admin
        .post(`/api/companies/${acme.id}/domains`)
        .send({ domain: 'acme-india.example' })
        .expect(201);
      const original = (added.body as CompanyDetailDto).domains.find(
        (d) => d.domain === 'acme.example',
      );
      expect(original?.employeeCount).toBe(6);
      const used = await admin
        .delete(`/api/companies/${acme.id}/domains/${original?.id}`)
        .expect(422);
      expect(used.body).toMatchObject({
        code: 'DOMAIN_IN_USE',
        message: '6 employees have emails on acme.example. Change their emails first.',
      });

      const spare = (added.body as CompanyDetailDto).domains.find(
        (d) => d.domain === 'acme-india.example',
      );
      await admin.delete(`/api/companies/${acme.id}/domains/${spare?.id}`).expect(200);
    });
  });

  describe('access', () => {
    it('only roles with company and employee permissions get in', async () => {
      await kitchen.get('/api/companies').expect(403);
      await kitchen.get('/api/employees').expect(403);
      await dispatch.post('/api/companies').send(company('Nope', 'nope.example')).expect(403);
      await dispatch.post('/api/employees').send(employee(acme.id, 'x@acme.example')).expect(403);
    });
  });
});
