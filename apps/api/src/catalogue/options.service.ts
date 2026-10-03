import { Injectable } from '@nestjs/common';
import type { OptionDto, OptionInput } from '@fernleaf/shared';
import { BusinessRuleError, NotFoundError } from '../common/errors/domain-error.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkIdsExist } from './reference-checks.js';

const optionInclude = {
  allergens: true,
  dietaryTags: true,
  portions: { include: { portionSize: true }, orderBy: { portionSize: { sortOrder: 'asc' } } },
  _count: { select: { groupMemberships: true } },
} satisfies Prisma.OptionInclude;

type OptionWithDetails = Prisma.OptionGetPayload<{ include: typeof optionInclude }>;

/** Reusable choices offered by dishes' option groups (spec 4.1). */
@Injectable()
export class OptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeCosts: boolean): Promise<OptionDto[]> {
    const options = await this.prisma.option.findMany({
      include: optionInclude,
      orderBy: { name: 'asc' },
    });
    return options.map((option) => toDto(option, includeCosts));
  }

  async create(input: OptionInput): Promise<OptionDto> {
    await this.checkReferences(input);
    try {
      const option = await this.prisma.option.create({
        data: {
          ...optionFields(input),
          allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
          dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
          portions: { create: input.portions },
        },
        include: optionInclude,
      });
      return toDto(option, true);
    } catch (error) {
      throw translateNameClash(error, input.name);
    }
  }

  async update(id: string, input: OptionInput): Promise<OptionDto> {
    const current = await this.prisma.option.findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Option');
    await this.checkReferences(input);
    await this.checkPortionsStillCovered(id, input);

    try {
      const [, , , option] = await this.prisma.$transaction([
        this.prisma.optionAllergen.deleteMany({ where: { optionId: id } }),
        this.prisma.optionDietaryTag.deleteMany({ where: { optionId: id } }),
        this.prisma.optionPortion.deleteMany({ where: { optionId: id } }),
        this.prisma.option.update({
          where: { id },
          data: {
            ...optionFields(input),
            allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
            dietaryTags: {
              create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })),
            },
            portions: { create: input.portions },
          },
          include: optionInclude,
        }),
      ]);
      return toDto(option, true);
    } catch (error) {
      throw translateNameClash(error, input.name);
    }
  }

  /**
   * An option can't stop selling a size that a portioned group still sells it in - otherwise
   * that group would break the rule "every option in it must support the group's sizes".
   */
  private async checkPortionsStillCovered(id: string, input: OptionInput): Promise<void> {
    const keptSizes = new Set(input.portions.map((portion) => portion.portionSizeId));
    const memberships = await this.prisma.optionGroupOption.findMany({
      where: { optionId: id, group: { usesPortions: true } },
      include: {
        group: { include: { dish: true, portionSizes: { include: { portionSize: true } } } },
      },
    });
    for (const { group } of memberships) {
      const missing = group.portionSizes.filter((size) => !keptSizes.has(size.portionSizeId));
      if (missing.length > 0) {
        const message = `Still needed: the “${group.name}” group on ${group.dish.name} sells this option in ${missing
          .map((size) => size.portionSize.name)
          .join(', ')}.`;
        throw new BusinessRuleError('PORTION_SIZE_IN_USE', message, [
          { path: 'portions', message },
        ]);
      }
    }
  }

  private checkReferences(input: OptionInput): Promise<void> {
    return checkIdsExist([
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
      {
        table: this.prisma.portionSize,
        ids: input.portions.map((portion) => portion.portionSizeId),
        path: 'portions',
        label: 'portion sizes',
      },
    ]);
  }
}

function optionFields(input: OptionInput) {
  return {
    name: input.name,
    description: input.description,
    costCents: input.costCents,
    isActive: input.isActive,
  };
}

function translateNameClash(error: unknown, name: string): unknown {
  if (!isUniqueViolation(error)) return error;
  const message = `There is already an option called “${name}”.`;
  return new BusinessRuleError('NAME_TAKEN', message, [{ path: 'name', message }]);
}

function toDto(option: OptionWithDetails, includeCosts: boolean): OptionDto {
  return {
    id: option.id,
    name: option.name,
    description: option.description,
    costCents: includeCosts ? option.costCents : null,
    allergenIds: option.allergens.map((a) => a.allergenId),
    dietaryTagIds: option.dietaryTags.map((t) => t.dietaryTagId),
    portions: option.portions.map((portion) => ({
      portionSizeId: portion.portionSizeId,
      portionSizeName: portion.portionSize.name,
      extraChargeCents: portion.extraChargeCents,
    })),
    usedInGroups: option._count.groupMemberships,
    isActive: option.isActive,
  };
}
