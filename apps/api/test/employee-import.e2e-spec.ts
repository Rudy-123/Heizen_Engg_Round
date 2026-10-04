import type { EmployeeDto, EmployeeImportResultDto, Page } from '@fernleaf/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import { seedIdentity } from '../prisma/seed/identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { signInAs } from './support/sign-in.js';

/** [Should] spec 4.5: bulk-import employees from CSV, with row-level errors. */
describe('Employee CSV import (e2e)', () => {
  let app: NestExpressApplication;
  let admin: request.Agent;
  let kitchen: request.Agent;
  let companyId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await seedIdentity(app.get(PrismaService));
    admin = await signInAs(app, 'admin@test.com');
    kitchen = await signInAs(app, 'kitchen@test.com');
    await admin.post('/api/reference/allergens').send({ name: 'IM Sesame' }).expect(201);
    const { body } = await admin
      .post('/api/companies')
      .send({
        name: 'IM Company',
        domain: 'im-co.example',
        address: { label: 'Office', line1: '1 Road', city: 'Pune', postcode: '411001' },
        billingContactName: 'Accounts',
        billingEmail: 'accounts@im-co.example',
        billingAddress: 'Pune',
      })
      .expect(201);
    companyId = (body as { id: string }).id;
    await admin
      .post('/api/employees')
      .send({ companyId, firstName: 'Tara', lastName: 'Taken', email: 'taken@im-co.example' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('saves the good rows and reports every bad row with its line number and reason', async () => {
    const csv = [
      'First name,Last name,Email,Phone,can_choose_address,Allergies',
      'Asha,Iyer,asha@im-co.example,,yes,IM Sesame',
      '"Rao, Jr.",Nandini,nandini@im-co.example,+91 98000 00000,no,',
      'Bad,Domain,bad@gmail.com,,no,',
      ',Missing,missing@im-co.example,,no,',
      'Dup,One,ASHA@im-co.example,,no,',
      'Taken,Already,taken@im-co.example,,no,',
      'Flag,Wrong,flag@im-co.example,,maybe,',
      'Allergy,Unknown,allergy@im-co.example,,no,Moonbeams',
      '',
      '',
    ].join('\r\n');
    const { body } = await admin.post('/api/employees/import').send({ companyId, csv }).expect(200);
    const result = body as EmployeeImportResultDto;
    expect(result).toMatchObject({ rows: 8, created: 2 });
    expect(result.errors.map((e) => [e.row, e.messages.join(' ')])).toEqual([
      [4, expect.stringMatching(/^Use an email on IM Company's domain: im-co\.example\.$/)],
      [5, expect.stringMatching(/^first_name: /)],
      [6, 'The same email is already on row 2 of this file.'],
      [7, 'taken@im-co.example is already used by another employee.'],
      [8, 'can_choose_address: use yes or no (not "maybe").'],
      [9, 'Unknown allergy "Moonbeams".'],
    ]);

    const { body: page } = await admin
      .get(`/api/employees?companyId=${companyId}&search=asha`)
      .expect(200);
    const asha = (page as Page<EmployeeDto>).items[0];
    expect(asha).toMatchObject({ canChooseAddress: true, email: 'asha@im-co.example' });
    expect(asha?.allergenIds).toHaveLength(1);
    const { body: rao } = await admin
      .get(`/api/employees?companyId=${companyId}&search=nandini`)
      .expect(200);
    expect((rao as Page<EmployeeDto>).items[0]).toMatchObject({
      firstName: 'Rao, Jr.',
      phone: '+91 98000 00000',
    });
  });

  it('refuses a file without the required columns, and people without the permission', async () => {
    const { body } = await admin
      .post('/api/employees/import')
      .send({ companyId, csv: 'name,mail\nA,a@im-co.example' })
      .expect(422);
    expect(body.message).toBe(
      'The first row must name the columns. Missing: first_name, last_name, email.',
    );
    await kitchen
      .post('/api/employees/import')
      .send({ companyId, csv: 'first_name,last_name,email' })
      .expect(403);
  });
});
