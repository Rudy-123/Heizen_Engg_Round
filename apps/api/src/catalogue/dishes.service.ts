import { Injectable } from '@nestjs/common';
import type {
  DishDetailDto,
  DishInput,
  DishOptionGroupsInput,
  DishSummaryDto,
  FieldError,
  OptionGroupDto,
} from '@fernleaf/shared';
import type { z } from 'zod';
import type { dishListQuerySchema } from '@fernleaf/shared';
import { BusinessRuleError, NotFoundError } from '../common/errors/domain-error.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkIdsExist } from './reference-checks.js';

const detailInclude = {
  kitchenStation: true,
  allergens: true,
  dietaryTags: true,
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: {
      options: { orderBy: { sortOrder: 'asc' }, include: { option: true } },
      portionSizes: { orderBy: { sortOrder: 'asc' }, include: { portionSize: true } },
    },
  },
} satisfies Prisma.DishInclude;

type DishWithDetails = Prisma.DishGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class DishesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: z.infer<typeof dishListQuerySchema>,
    includeCosts: boolean,
  ): Promise<DishSummaryDto[]> {
    const dishes = await this.prisma.dish.findMany({
      where: {
        ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { kitchenStation: true, _count: { select: { optionGroups: true } } },
      orderBy: { name: 'asc' },
    });
    return dishes.map((dish) => ({
      id: dish.id,
      sku: dish.sku,
      name: dish.name,
      imageUrl: dish.imageUrl,
      temperature: dish.temperature,
      kitchenStation: dish.kitchenStation
        ? { id: dish.kitchenStation.id, name: dish.kitchenStation.name }
        : null,
      costCents: includeCosts ? dish.costCents : null,
      optionGroupCount: dish._count.optionGroups,
      isActive: dish.isActive,
    }));
  }

  async get(id: string, includeCosts: boolean): Promise<DishDetailDto> {
    const dish = await this.prisma.dish.findUnique({ where: { id }, include: detailInclude });
    if (!dish) throw new NotFoundError('Dish');
    return toDetail(dish, includeCosts);
  }

  async create(input: DishInput): Promise<DishDetailDto> {
    await this.checkReferences(input);
    try {
      const dish = await this.prisma.dish.create({
        data: {
          ...dishFields(input),
          allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
          dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
        },
      });
      return this.get(dish.id, true);
    } catch (error) {
      throw translateSkuClash(error, input.sku);
    }
  }

  async update(id: string, input: DishInput): Promise<DishDetailDto> {
    await this.ensureExists(id);
    await this.checkReferences(input);
    try {
      await this.prisma.$transaction([
        this.prisma.dishAllergen.deleteMany({ where: { dishId: id } }),
        this.prisma.dishDietaryTag.deleteMany({ where: { dishId: id } }),
        this.prisma.dish.update({
          where: { id },
          data: {
            ...dishFields(input),
            allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
            dietaryTags: {
              create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })),
            },
          },
        }),
      ]);
    } catch (error) {
      throw translateSkuClash(error, input.sku);
    }
    return this.get(id, true);
  }

  /**
   * Replaces the dish's option groups with the given ordered list: groups with an id are
   * updated, new ones created, missing ones removed. Past orders are unaffected - they keep
   * snapshots of the group and option names they were sold with.
   */
  async replaceOptionGroups(id: string, input: DishOptionGroupsInput): Promise<DishDetailDto> {
    await this.ensureExists(id);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.optionGroup.findMany({
        where: { dishId: id },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((group) => group.id));
      const problems: FieldError[] = [];

      input.groups.forEach((group, index) => {
        if (group.id && !existingIds.has(group.id)) {
          problems.push({
            path: `groups.${index}`,
            message: 'This group belongs to another dish.',
          });
        }
      });

      await checkIdsExist([
        {
          table: tx.portionSize,
          ids: input.groups.flatMap((g) => g.portionSizeIds),
          path: 'groups',
          label: 'portion sizes',
        },
      ]);

      // Portions rule (spec 4.1): if a group sells in sizes, every option in it must support them.
      const options = await tx.option.findMany({
        where: { id: { in: [...new Set(input.groups.flatMap((g) => g.optionIds))] } },
        include: { portions: { include: { portionSize: true } } },
      });
      const optionsById = new Map(options.map((option) => [option.id, option]));
      const sizeNames = new Map(
        (
          await tx.portionSize.findMany({
            where: { id: { in: input.groups.flatMap((g) => g.portionSizeIds) } },
          })
        ).map((size) => [size.id, size.name]),
      );

      input.groups.forEach((group, groupIndex) => {
        group.optionIds.forEach((optionId, optionIndex) => {
          const option = optionsById.get(optionId);
          const path = `groups.${groupIndex}.optionIds.${optionIndex}`;
          if (!option) {
            problems.push({ path, message: 'This option no longer exists.' });
            return;
          }
          if (!group.usesPortions) return;
          const sold = new Set(option.portions.map((portion) => portion.portionSizeId));
          const missing = group.portionSizeIds.filter((sizeId) => !sold.has(sizeId));
          if (missing.length > 0) {
            const names = missing.map((sizeId) => sizeNames.get(sizeId) ?? 'a size').join(', ');
            problems.push({
              path,
              message: `“${option.name}” isn’t sold in ${names}. Add that size to the option first.`,
            });
          }
        });
      });

      if (problems.length > 0) {
        throw new BusinessRuleError(
          'INVALID_OPTION_GROUPS',
          'Some option groups need fixing.',
          problems,
        );
      }

      const keptIds = input.groups.flatMap((group) => (group.id ? [group.id] : []));
      await tx.optionGroup.deleteMany({ where: { dishId: id, id: { notIn: keptIds } } });

      for (const [sortOrder, group] of input.groups.entries()) {
        const data = {
          name: group.name,
          isRequired: group.isRequired,
          maxSelections: group.maxSelections,
          usesPortions: group.usesPortions,
          sortOrder,
        };
        const saved = group.id
          ? await tx.optionGroup.update({ where: { id: group.id }, data })
          : await tx.optionGroup.create({ data: { ...data, dishId: id } });

        await tx.optionGroupOption.deleteMany({ where: { groupId: saved.id } });
        await tx.optionGroupPortionSize.deleteMany({ where: { groupId: saved.id } });
        await tx.optionGroupOption.createMany({
          data: group.optionIds.map((optionId, index) => ({
            groupId: saved.id,
            optionId,
            sortOrder: index,
          })),
        });
        await tx.optionGroupPortionSize.createMany({
          data: group.portionSizeIds.map((portionSizeId, index) => ({
            groupId: saved.id,
            portionSizeId,
            sortOrder: index,
          })),
        });
      }
    });
    return this.get(id, true);
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.dish.count({ where: { id } });
    if (found === 0) throw new NotFoundError('Dish');
  }

  private checkReferences(input: DishInput): Promise<void> {
    return checkIdsExist([
      {
        table: this.prisma.kitchenStation,
        ids: input.kitchenStationId ? [input.kitchenStationId] : [],
        path: 'kitchenStationId',
        label: 'kitchen stations',
      },
      {
        table: this.prisma.allergen,
        ids: input.allergenIds,
        path: 'allergenIds',
        label: 'allergens',
      },
      {
        table: this.prisma.dietaryTag,
        ids: input.dietaryTagIds,
        path: 'dietaryTagIds',
        label: 'dietary tags',
      },
    ]);
  }
}

function dishFields(input: DishInput) {
  return {
    sku: input.sku,
    name: input.name,
    description: input.description,
    imageUrl: input.imageUrl,
    temperature: input.temperature,
    costCents: input.costCents,
    kitchenStationId: input.kitchenStationId,
    minOrderQuantity: input.minOrderQuantity,
    isActive: input.isActive,
  };
}

function translateSkuClash(error: unknown, sku: string): unknown {
  if (!isUniqueViolation(error)) return error;
  const message = `SKU ${sku} is already used by another dish.`;
  return new BusinessRuleError('SKU_TAKEN', message, [{ path: 'sku', message }]);
}

function toDetail(dish: DishWithDetails, includeCosts: boolean): DishDetailDto {
  return {
    id: dish.id,
    sku: dish.sku,
    name: dish.name,
    description: dish.description,
    imageUrl: dish.imageUrl,
    temperature: dish.temperature,
    kitchenStation: dish.kitchenStation
      ? { id: dish.kitchenStation.id, name: dish.kitchenStation.name }
      : null,
    costCents: includeCosts ? dish.costCents : null,
    minOrderQuantity: dish.minOrderQuantity,
    allergenIds: dish.allergens.map((a) => a.allergenId),
    dietaryTagIds: dish.dietaryTags.map((t) => t.dietaryTagId),
    optionGroupCount: dish.optionGroups.length,
    optionGroups: dish.optionGroups.map((group): OptionGroupDto => ({
      id: group.id,
      name: group.name,
      isRequired: group.isRequired,
      maxSelections: group.maxSelections,
      usesPortions: group.usesPortions,
      portionSizes: group.portionSizes.map((s) => ({
        id: s.portionSize.id,
        name: s.portionSize.name,
      })),
      options: group.options.map((o) => ({
        id: o.option.id,
        name: o.option.name,
        isActive: o.option.isActive,
      })),
    })),
    isActive: dish.isActive,
    updatedAt: dish.updatedAt.toISOString(),
  };
}
