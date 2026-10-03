import { Injectable } from '@nestjs/common';
import type {
  CompanyMenuHidingInput,
  MenuCategoryDto,
  MenuCategoryInput,
  MenuPreviewDto,
} from '@fernleaf/shared';
import { checkIdsExist } from '../catalogue/reference-checks.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/domain-error.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import {
  resolveMenu,
  type MenuCategoryInput as ResolverCategory,
  type ResolvedMenu,
} from '../domain/menu.js';
import { tierForCompany, tierRuleFromColumns } from '../domain/pricing.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const refs = { include: { allergen: true } } as const;
const tags = { include: { dietaryTag: true } } as const;
const prices = { select: { tierId: true, priceCents: true } } as const;

/** Everything the menu resolver needs about a dish. */
const dishForMenu = {
  allergens: refs,
  dietaryTags: tags,
  prices,
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: {
      portionSizes: { orderBy: { sortOrder: 'asc' }, include: { portionSize: true } },
      options: {
        orderBy: { sortOrder: 'asc' },
        include: {
          option: { include: { allergens: refs, dietaryTags: tags, portions: true, prices } },
        },
      },
    },
  },
} satisfies Prisma.DishInclude;

type DishForMenu = Prisma.DishGetPayload<{ include: typeof dishForMenu }>;

/** The resolved menu for one employee, plus who they are and which tier priced it. */
export interface EmployeeMenu extends ResolvedMenu {
  employee: MenuPreviewDto['employee'];
  company: MenuPreviewDto['company'];
  tier: MenuPreviewDto['tier'];
}

/** Menu categories and items (spec 4.2), company hiding, and the menu as an employee sees it. */
@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<MenuCategoryDto[]> {
    const categories = await this.prisma.menuCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { items: { orderBy: { sortOrder: 'asc' }, include: { dish: true } } },
    });
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      isSecret: category.isSecret,
      items: category.items.map((item) => ({
        id: item.id,
        isActive: item.isActive,
        dish: {
          id: item.dish.id,
          name: item.dish.name,
          sku: item.dish.sku,
          imageUrl: item.dish.imageUrl,
          isActive: item.dish.isActive,
        },
      })),
    }));
  }

  async createCategory(input: MenuCategoryInput): Promise<MenuCategoryDto[]> {
    const last = await this.prisma.menuCategory.aggregate({ _max: { sortOrder: true } });
    try {
      await this.prisma.menuCategory.create({
        data: { ...input, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
    } catch (error) {
      throw translateNameClash(error, input.name);
    }
    return this.listCategories();
  }

  async updateCategory(id: string, input: MenuCategoryInput): Promise<MenuCategoryDto[]> {
    const category = await this.prisma.menuCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundError('Category');
    try {
      await this.prisma.menuCategory.update({ where: { id }, data: input });
    } catch (error) {
      throw translateNameClash(error, input.name);
    }
    return this.listCategories();
  }

  async reorderCategories(ids: string[]): Promise<MenuCategoryDto[]> {
    const existing = await this.prisma.menuCategory.findMany({ select: { id: true } });
    assertSameIds(
      existing.map((c) => c.id),
      ids,
    );
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.menuCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.listCategories();
  }

  async addItem(categoryId: string, dishId: string): Promise<MenuCategoryDto[]> {
    const [category, dish, last] = await Promise.all([
      this.prisma.menuCategory.findUnique({ where: { id: categoryId } }),
      this.prisma.dish.findUnique({ where: { id: dishId } }),
      this.prisma.menuItem.aggregate({ where: { categoryId }, _max: { sortOrder: true } }),
    ]);
    if (!category) throw new NotFoundError('Category');
    if (!dish) {
      throw new BusinessRuleError('UNKNOWN_REFERENCE', 'That dish no longer exists.', [
        { path: 'dishId', message: 'That dish no longer exists.' },
      ]);
    }
    try {
      await this.prisma.menuItem.create({
        data: { categoryId, dishId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const message = `${dish.name} is already in ${category.name}.`;
      throw new BusinessRuleError('DISH_ALREADY_LISTED', message, [{ path: 'dishId', message }]);
    }
    return this.listCategories();
  }

  async reorderItems(categoryId: string, ids: string[]): Promise<MenuCategoryDto[]> {
    const existing = await this.prisma.menuItem.findMany({
      where: { categoryId },
      select: { id: true },
    });
    assertSameIds(
      existing.map((item) => item.id),
      ids,
    );
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.menuItem.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.listCategories();
  }

  async updateItem(id: string, isActive: boolean): Promise<MenuCategoryDto[]> {
    const { count } = await this.prisma.menuItem.updateMany({ where: { id }, data: { isActive } });
    if (count === 0) throw new NotFoundError('Menu item');
    return this.listCategories();
  }

  /** Takes a dish out of one category. Orders refer to dishes, not menu items, so nothing breaks. */
  async removeItem(id: string): Promise<MenuCategoryDto[]> {
    const { count } = await this.prisma.menuItem.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundError('Menu item');
    return this.listCategories();
  }

  /** Replaces what a company's employees never see (spec 4.2 "Hiding"). */
  async setCompanyHiding(
    companyId: string,
    input: CompanyMenuHidingInput,
  ): Promise<CompanyMenuHidingInput> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundError('Company');
    const hiddenCategoryIds = [...new Set(input.hiddenCategoryIds)];
    const hiddenMenuItemIds = [...new Set(input.hiddenMenuItemIds)];
    await checkIdsExist([
      {
        table: this.prisma.menuCategory,
        ids: hiddenCategoryIds,
        path: 'hiddenCategoryIds',
        label: 'categories',
      },
      {
        table: this.prisma.menuItem,
        ids: hiddenMenuItemIds,
        path: 'hiddenMenuItemIds',
        label: 'menu items',
      },
    ]);
    await this.prisma.$transaction([
      this.prisma.companyHiddenCategory.deleteMany({ where: { companyId } }),
      this.prisma.companyHiddenMenuItem.deleteMany({ where: { companyId } }),
      this.prisma.companyHiddenCategory.createMany({
        data: hiddenCategoryIds.map((categoryId) => ({ companyId, categoryId })),
      }),
      this.prisma.companyHiddenMenuItem.createMany({
        data: hiddenMenuItemIds.map((menuItemId) => ({ companyId, menuItemId })),
      }),
    ]);
    return { hiddenCategoryIds, hiddenMenuItemIds };
  }

  /**
   * The menu exactly as this employee would see it (spec 4.2): their company's hiding and
   * price tier (or the default tier) applied. The order form uses the same function.
   */
  async menuForEmployee(employeeId: string): Promise<EmployeeMenu> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        company: { include: { hiddenCategories: true, hiddenMenuItems: true } },
        allergies: refs,
        dietaryPreferences: tags,
      },
    });
    if (!employee) throw new NotFoundError('Employee');

    const tiers = await this.prisma.priceTier.findMany();
    const defaultTier = tiers.find((tier) => tier.isDefault);
    if (!defaultTier) {
      throw new BusinessRuleError(
        'NO_PRICE_TIERS',
        'Set up a price tier first - without one, no dish has a price.',
      );
    }
    const tierId = tierForCompany(employee.company.priceTierId, defaultTier.id);
    const tier = tiers.find((candidate) => candidate.id === tierId) ?? defaultTier;

    const categories = await this.prisma.menuCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        items: { orderBy: { sortOrder: 'asc' }, include: { dish: { include: dishForMenu } } },
      },
    });

    const allergies = employee.allergies.map((a) => ({ id: a.allergen.id, name: a.allergen.name }));
    const resolved = resolveMenu(
      categories.map((category): ResolverCategory => ({
        id: category.id,
        name: category.name,
        description: category.description,
        isActive: category.isActive,
        isSecret: category.isSecret,
        items: category.items.map((item) => ({
          id: item.id,
          isActive: item.isActive,
          dish: toResolverDish(item.dish),
        })),
      })),
      {
        rules: new Map(tiers.map((t) => [t.id, tierRuleFromColumns(t)])),
        tierId: tier.id,
        tierName: tier.name,
        companyName: employee.company.name,
        hiddenCategoryIds: new Set(employee.company.hiddenCategories.map((h) => h.categoryId)),
        hiddenMenuItemIds: new Set(employee.company.hiddenMenuItems.map((h) => h.menuItemId)),
        allergies: new Map(allergies.map((a) => [a.id, a.name])),
      },
    );

    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        allergies,
        dietaryPreferences: employee.dietaryPreferences.map((d) => ({
          id: d.dietaryTag.id,
          name: d.dietaryTag.name,
        })),
      },
      company: { id: employee.company.id, name: employee.company.name },
      tier: {
        id: tier.id,
        name: tier.name,
        isDefault: tier.isDefault,
        fromCompany: employee.company.priceTierId !== null,
      },
      ...resolved,
    };
  }
}

function toResolverDish(dish: DishForMenu) {
  const priceMap = (rows: { tierId: string; priceCents: number }[]) =>
    new Map(rows.map((row) => [row.tierId, row.priceCents]));
  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    imageUrl: dish.imageUrl,
    temperature: dish.temperature,
    minOrderQuantity: dish.minOrderQuantity,
    isActive: dish.isActive,
    costCents: dish.costCents,
    explicitPrices: priceMap(dish.prices),
    allergens: dish.allergens.map((a) => ({ id: a.allergen.id, name: a.allergen.name })),
    dietaryTags: dish.dietaryTags.map((t) => ({ id: t.dietaryTag.id, name: t.dietaryTag.name })),
    groups: dish.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      isRequired: group.isRequired,
      maxSelections: group.maxSelections,
      usesPortions: group.usesPortions,
      sizes: group.portionSizes.map((s) => ({ id: s.portionSize.id, name: s.portionSize.name })),
      options: group.options.map(({ option }) => ({
        id: option.id,
        name: option.name,
        isActive: option.isActive,
        costCents: option.costCents,
        explicitPrices: priceMap(option.prices),
        allergens: option.allergens.map((a) => ({ id: a.allergen.id, name: a.allergen.name })),
        dietaryTags: option.dietaryTags.map((t) => ({
          id: t.dietaryTag.id,
          name: t.dietaryTag.name,
        })),
        portions: option.portions.map((p) => ({
          portionSizeId: p.portionSizeId,
          extraChargeCents: p.extraChargeCents,
        })),
      })),
    })),
  };
}

/** A reorder must list exactly the current entries - otherwise someone changed them meanwhile. */
function assertSameIds(current: string[], requested: string[]): void {
  const wanted = new Set(requested);
  if (current.length !== requested.length || current.some((id) => !wanted.has(id))) {
    throw new ConflictError(
      'The menu changed since you loaded it. Reload and try again.',
      'MENU_CHANGED',
    );
  }
}

function translateNameClash(error: unknown, name: string): unknown {
  if (!isUniqueViolation(error)) return error;
  const message = `There is already a category called “${name}”.`;
  return new BusinessRuleError('NAME_TAKEN', message, [{ path: 'name', message }]);
}
