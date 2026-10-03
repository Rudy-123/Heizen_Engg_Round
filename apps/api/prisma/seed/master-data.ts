import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  COMPANIES,
  EXTRA_STAFF,
  FIRST_NAMES,
  KITCHEN_HOLIDAYS,
  LAST_NAMES,
  MENU,
  TIERS,
  type CompanySeed,
} from './demo-business.js';
import { DISHES, OPTIONS, REFERENCE_LISTS } from './demo-catalogue.js';

/**
 * Seeds the demo kitchen's master data: reference lists, catalogue, price tiers, menu,
 * companies with their employees, and extra staff. Orders are NOT seeded here - they are
 * created by the demo simulation through the real order rules.
 *
 * Safe to run any number of times: every step only creates what is missing (matched by
 * name, SKU or email) and never changes or deletes what is already there, so edits made in
 * the app survive a re-run. The one fill-in: a demo dish with no photo gets its photo.
 */
export async function seedMasterData(prisma: PrismaClient): Promise<void> {
  const ref = await seedReferenceLists(prisma);
  await seedExtraStaff(prisma);
  const optionIds = await seedOptions(prisma, ref);
  const dishIds = await seedDishes(prisma, ref, optionIds);
  const tierIds = await seedTiers(prisma, dishIds, optionIds);
  const menu = await seedMenu(prisma, dishIds);
  for (const [index, company] of COMPANIES.entries()) {
    await seedCompany(prisma, company, index, { ref, tierIds, menu });
  }
  for (const holiday of KITCHEN_HOLIDAYS) {
    await prisma.kitchenHoliday.upsert({
      where: { date: new Date(`${holiday.date}T00:00:00.000Z`) },
      create: { date: new Date(`${holiday.date}T00:00:00.000Z`), name: holiday.name },
      update: {},
    });
  }
}

type Ids = Map<string, string>;

interface ReferenceIds {
  allergens: Ids;
  tags: Ids;
  stations: Ids;
  sizes: Ids;
  packaging: Ids;
}

/**
 * Demo dish photos ship with the web app (apps/web/public/dishes/<sku>.jpg): real photos from
 * Wikimedia Commons, credited in CREDITS.md in that folder.
 */
function dishPhoto(sku: string): string {
  return `/dishes/${sku.toLowerCase()}.jpg`;
}

function idOf(ids: Ids, key: string): string {
  const id = ids.get(key);
  if (!id) throw new Error(`Seed data refers to an unknown entry: ${key}`);
  return id;
}

async function seedReferenceLists(prisma: PrismaClient): Promise<ReferenceIds> {
  // The five lists have the same shape. An upsert with an empty update only creates.
  const seedList = async (
    names: string[],
    upsert: (args: {
      where: { name: string };
      create: { name: string; sortOrder: number };
      update: object;
    }) => Promise<{ id: string }>,
  ): Promise<Ids> => {
    const ids: Ids = new Map();
    for (const [sortOrder, name] of names.entries()) {
      const row = await upsert({ where: { name }, create: { name, sortOrder }, update: {} });
      ids.set(name, row.id);
    }
    return ids;
  };
  return {
    allergens: await seedList(REFERENCE_LISTS.allergens, (args) => prisma.allergen.upsert(args)),
    tags: await seedList(REFERENCE_LISTS.dietaryTags, (args) => prisma.dietaryTag.upsert(args)),
    stations: await seedList(REFERENCE_LISTS.kitchenStations, (args) =>
      prisma.kitchenStation.upsert(args),
    ),
    sizes: await seedList(REFERENCE_LISTS.portionSizes, (args) => prisma.portionSize.upsert(args)),
    packaging: await seedList(REFERENCE_LISTS.packagingTypes, (args) =>
      prisma.packagingType.upsert(args),
    ),
  };
}

/** Extra drivers and kitchen staff. No password: they exist to be assigned, not to sign in. */
async function seedExtraStaff(prisma: PrismaClient): Promise<void> {
  for (const person of EXTRA_STAFF) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: person.roleKey } });
    await prisma.user.upsert({
      where: { email: person.email },
      create: {
        name: person.name,
        email: person.email,
        phone: person.phone,
        roleId: role.id,
        passwordHash: null,
      },
      update: {},
    });
  }
}

async function seedOptions(prisma: PrismaClient, ref: ReferenceIds): Promise<Ids> {
  const ids: Ids = new Map();
  for (const option of OPTIONS) {
    const existing = await prisma.option.findUnique({ where: { name: option.name } });
    const row =
      existing ??
      (await prisma.option.create({
        data: {
          name: option.name,
          costCents: option.costCents,
          allergens: {
            create: (option.allergens ?? []).map((name) => ({
              allergenId: idOf(ref.allergens, name),
            })),
          },
          dietaryTags: {
            create: (option.tags ?? []).map((name) => ({ dietaryTagId: idOf(ref.tags, name) })),
          },
          portions: {
            create: (option.portions ?? []).map(([size, extraChargeCents]) => ({
              portionSizeId: idOf(ref.sizes, size),
              extraChargeCents,
            })),
          },
        },
      }));
    ids.set(option.name, row.id);
  }
  return ids;
}

async function seedDishes(prisma: PrismaClient, ref: ReferenceIds, optionIds: Ids): Promise<Ids> {
  const ids: Ids = new Map();
  for (const dish of DISHES) {
    const existing = await prisma.dish.findUnique({
      where: { sku: dish.sku },
      include: { _count: { select: { optionGroups: true } } },
    });
    const row =
      existing ??
      (await prisma.dish.create({
        data: {
          sku: dish.sku,
          name: dish.name,
          description: dish.description,
          temperature: dish.temperature,
          costCents: dish.costCents,
          kitchenStationId: dish.station ? idOf(ref.stations, dish.station) : null,
          minOrderQuantity: dish.minOrderQuantity ?? null,
          imageUrl: dishPhoto(dish.sku),
          isActive: dish.isActive ?? true,
          allergens: {
            create: (dish.allergens ?? []).map((name) => ({
              allergenId: idOf(ref.allergens, name),
            })),
          },
          dietaryTags: {
            create: (dish.tags ?? []).map((name) => ({ dietaryTagId: idOf(ref.tags, name) })),
          },
        },
        include: { _count: { select: { optionGroups: true } } },
      }));
    ids.set(dish.sku, row.id);

    // Demo dishes created before the photos existed get one - a photo set in the app stays.
    if (existing && !existing.imageUrl) {
      await prisma.dish.update({ where: { id: row.id }, data: { imageUrl: dishPhoto(dish.sku) } });
    }

    // Option groups only for a dish that has none yet (staff may have changed them since).
    if (row._count.optionGroups === 0) {
      for (const [sortOrder, group] of (dish.groups ?? []).entries()) {
        await prisma.optionGroup.create({
          data: {
            dishId: row.id,
            name: group.name,
            isRequired: group.isRequired,
            maxSelections: group.maxSelections,
            usesPortions: (group.sizes ?? []).length > 0,
            sortOrder,
            options: {
              create: group.options.map((name, index) => ({
                optionId: idOf(optionIds, name),
                sortOrder: index,
              })),
            },
            portionSizes: {
              create: (group.sizes ?? []).map((size, index) => ({
                portionSizeId: idOf(ref.sizes, size),
                sortOrder: index,
              })),
            },
          },
        });
      }
    }
  }
  return ids;
}

async function seedTiers(prisma: PrismaClient, dishIds: Ids, optionIds: Ids): Promise<Ids> {
  const ids: Ids = new Map();
  for (const [sortOrder, tier] of TIERS.entries()) {
    const row = await prisma.priceTier.upsert({
      where: { name: tier.name },
      create: {
        name: tier.name,
        description: tier.description,
        ruleBasis: tier.ruleBasis,
        baseTierId: tier.baseTier ? idOf(ids, tier.baseTier) : null,
        multiplierBps: tier.multiplierBps ?? null,
        sortOrder,
      },
      update: {},
    });
    ids.set(tier.name, row.id);
  }
  // Exactly one default tier: Standard, unless someone already chose another one.
  if ((await prisma.priceTier.count({ where: { isDefault: true } })) === 0) {
    await prisma.priceTier.update({
      where: { id: idOf(ids, 'Standard') },
      data: { isDefault: true },
    });
  }

  // Typed prices: Standard's list prices, plus each tier's own. skipDuplicates keeps any
  // price staff have changed since.
  const standardId = idOf(ids, 'Standard');
  const dishPrices = DISHES.flatMap((dish) =>
    dish.standardCents === null
      ? []
      : [{ tierId: standardId, dishId: idOf(dishIds, dish.sku), priceCents: dish.standardCents }],
  );
  const optionPrices = OPTIONS.map((option) => ({
    tierId: standardId,
    optionId: idOf(optionIds, option.name),
    priceCents: option.standardCents,
  }));
  for (const tier of TIERS) {
    const tierId = idOf(ids, tier.name);
    for (const [sku, priceCents] of Object.entries(tier.dishPrices ?? {})) {
      dishPrices.push({ tierId, dishId: idOf(dishIds, sku), priceCents });
    }
    for (const [name, priceCents] of Object.entries(tier.optionPrices ?? {})) {
      optionPrices.push({ tierId, optionId: idOf(optionIds, name), priceCents });
    }
  }
  await prisma.dishPrice.createMany({ data: dishPrices, skipDuplicates: true });
  await prisma.optionPrice.createMany({ data: optionPrices, skipDuplicates: true });
  return ids;
}

/** Category ids by name, and menu item ids by "category|sku". */
interface MenuIds {
  categories: Ids;
  items: Ids;
}

async function seedMenu(prisma: PrismaClient, dishIds: Ids): Promise<MenuIds> {
  const menu: MenuIds = { categories: new Map(), items: new Map() };
  for (const [sortOrder, category] of MENU.entries()) {
    const row = await prisma.menuCategory.upsert({
      where: { name: category.name },
      create: {
        name: category.name,
        description: category.description,
        isSecret: category.isSecret ?? false,
        isActive: category.isActive ?? true,
        sortOrder,
      },
      update: {},
    });
    menu.categories.set(category.name, row.id);
    await prisma.menuItem.createMany({
      data: category.skus.map((sku, index) => ({
        categoryId: row.id,
        dishId: idOf(dishIds, sku),
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
    const items = await prisma.menuItem.findMany({
      where: { categoryId: row.id },
      include: { dish: true },
    });
    for (const item of items) menu.items.set(`${category.name}|${item.dish.sku}`, item.id);
  }
  return menu;
}

async function seedCompany(
  prisma: PrismaClient,
  seed: CompanySeed,
  companyIndex: number,
  { ref, tierIds, menu }: { ref: ReferenceIds; tierIds: Ids; menu: MenuIds },
): Promise<void> {
  const driver = await prisma.user.findUniqueOrThrow({ where: { email: seed.driverEmail } });
  const company =
    (await prisma.company.findUnique({ where: { name: seed.name } })) ??
    (await prisma.company.create({
      data: {
        name: seed.name,
        priceTierId: seed.tier ? idOf(tierIds, seed.tier) : null,
        billingContactName: seed.billing.contact,
        billingEmail: `${seed.billing.local}@${seed.domains[0]}`,
        billingPhone: seed.billing.phone,
        billingAddress: seed.billing.address,
        workingDays: seed.workingDays,
        defaultDeliveryTimeMinutes: seed.deliveryTime,
        deliveryLeadMinutes: seed.leadMinutes,
        defaultPackagingTypeId: idOf(ref.packaging, seed.packaging),
        driverInstructions: seed.driverInstructions,
        defaultDriverId: driver.id,
        isActive: seed.isActive ?? true,
        domains: { create: seed.domains.map((domain) => ({ domain })) },
        addresses: {
          create: seed.addresses.map((address, index) => ({
            ...address,
            line2: address.line2 ?? null,
            instructions: address.instructions ?? '',
            isDefault: index === 0,
          })),
        },
        holidays: {
          create: (seed.holidays ?? []).map((holiday) => ({
            date: new Date(`${holiday.date}T00:00:00.000Z`),
            name: holiday.name,
          })),
        },
      },
    }));

  const firstEmail = await seedEmployees(prisma, company.id, seed, companyIndex, ref);

  // The owner is the company's first employee (spec 4.4: one of its own employees).
  if (company.ownerEmployeeId === null && firstEmail) {
    const owner = await prisma.employee.findUnique({ where: { email: firstEmail } });
    if (owner && owner.companyId === company.id) {
      await prisma.company.update({
        where: { id: company.id },
        data: { ownerEmployeeId: owner.id },
      });
    }
  }

  await prisma.companyHiddenCategory.createMany({
    data: (seed.hiddenCategories ?? []).map((name) => ({
      companyId: company.id,
      categoryId: idOf(menu.categories, name),
    })),
    skipDuplicates: true,
  });
  await prisma.companyHiddenMenuItem.createMany({
    data: (seed.hiddenItems ?? []).map(([category, sku]) => ({
      companyId: company.id,
      menuItemId: idOf(menu.items, `${category}|${sku}`),
    })),
    skipDuplicates: true,
  });
}

/**
 * Employees with believable names, made the same way on every run (no randomness), so a
 * re-run finds them by email instead of creating new people. Returns the first one's email.
 */
async function seedEmployees(
  prisma: PrismaClient,
  companyId: string,
  seed: CompanySeed,
  companyIndex: number,
  ref: ReferenceIds,
): Promise<string | undefined> {
  const domain = seed.domains[0] ?? '';
  const used = new Set<string>();
  const people = Array.from({ length: seed.employees }, (_, i) => {
    const first = FIRST_NAMES[(i * 7 + companyIndex * 3) % FIRST_NAMES.length] ?? 'Asha';
    const last = LAST_NAMES[(i * 11 + companyIndex * 5) % LAST_NAMES.length] ?? 'Rao';
    let local = `${first}.${last}`.toLowerCase();
    if (used.has(local)) local = `${local}${i}`;
    used.add(local);
    return {
      companyId,
      firstName: first,
      lastName: last,
      email: `${local}@${domain}`,
      phone:
        i % 3 === 0
          ? `+91 98${String(20_000_000 + companyIndex * 1_000_000 + i * 7_919).slice(0, 8)}`
          : null,
      canChooseAddress: i % 4 === 0,
      canChangeDeliveryTime: i % 3 === 0,
      canChangePackaging: i % 5 === 0,
      isActive: i !== seed.employees - 1 || seed.employees < 10,
    };
  });

  // createManyAndReturn gives back only the rows it created, so a re-run adds nothing.
  const created = await prisma.employee.createManyAndReturn({ data: people, skipDuplicates: true });
  const index = new Map(people.map((person, i) => [person.email, i]));
  const allergies: { employeeId: string; allergenId: string }[] = [];
  const preferences: { employeeId: string; dietaryTagId: string }[] = [];
  for (const employee of created) {
    const i = index.get(employee.email) ?? 0;
    if (i % 9 === 1)
      allergies.push({ employeeId: employee.id, allergenId: idOf(ref.allergens, 'Dairy') });
    if (i % 13 === 2)
      allergies.push({ employeeId: employee.id, allergenId: idOf(ref.allergens, 'Peanuts') });
    if (i % 17 === 3)
      allergies.push({ employeeId: employee.id, allergenId: idOf(ref.allergens, 'Gluten') });
    if (i % 4 === 1)
      preferences.push({ employeeId: employee.id, dietaryTagId: idOf(ref.tags, 'Vegetarian') });
    if (i % 10 === 2)
      preferences.push({ employeeId: employee.id, dietaryTagId: idOf(ref.tags, 'Vegan') });
    if (i % 15 === 5)
      preferences.push({ employeeId: employee.id, dietaryTagId: idOf(ref.tags, 'Jain') });
  }
  await prisma.employeeAllergy.createMany({ data: allergies, skipDuplicates: true });
  await prisma.employeeDietaryPreference.createMany({ data: preferences, skipDuplicates: true });
  return people[0]?.email;
}
