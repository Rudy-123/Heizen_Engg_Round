import { Injectable } from '@nestjs/common';
import type {
  PriceTierDto,
  PriceTierInput,
  TierGridDto,
  TierGridRowDto,
  TierPriceChangesInput,
} from '@fernleaf/shared';
import { checkIdsExist } from '../catalogue/reference-checks.js';
import { BusinessRuleError, NotFoundError } from '../common/errors/domain-error.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import {
  derivedPrice,
  findRuleLoop,
  resolvePrice,
  tierRuleFromColumns,
  type PricedItem,
  type TierRules,
} from '../domain/pricing.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const tierInclude = {
  baseTier: { select: { id: true, name: true } },
  _count: { select: { companies: { where: { isActive: true } } } },
} satisfies Prisma.PriceTierInclude;

type TierRow = Prisma.PriceTierGetPayload<{ include: typeof tierInclude }>;

interface PricedRow extends PricedItem {
  id: string;
  name: string;
  sku: string | null;
  isActive: boolean;
}

/** Everything price resolution needs, loaded in one go (tens of dishes, a handful of tiers). */
interface PricingData {
  tiers: TierRow[];
  rules: TierRules;
  dishes: PricedRow[];
  options: PricedRow[];
  companiesWithoutTier: number;
}

/** Price tiers, their rules and typed prices (spec 4.3). */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async listTiers(): Promise<PriceTierDto[]> {
    const data = await this.load();
    return data.tiers.map((tier) => toTierDto(tier, data));
  }

  /** The whole tier at a glance: every dish and option, its price and where the price comes from. */
  async getGrid(tierId: string): Promise<TierGridDto> {
    const data = await this.load();
    const tier = data.tiers.find((candidate) => candidate.id === tierId);
    if (!tier) throw new NotFoundError('Price tier');
    return {
      tier: toTierDto(tier, data),
      dishes: data.dishes.map((dish) => toGridRow(data.rules, tierId, dish)),
      options: data.options.map((option) => toGridRow(data.rules, tierId, option)),
    };
  }

  async createTier(input: PriceTierInput): Promise<PriceTierDto> {
    const id = await this.writeTiers(input.name, async (tx) => {
      await checkRule(tx, null, input);
      const existing = await tx.priceTier.count();
      const tier = await tx.priceTier.create({
        // The first tier ever created becomes the default, so there always is one.
        data: { ...tierFields(input), isDefault: existing === 0, sortOrder: existing },
      });
      return tier.id;
    });
    return this.getTier(id);
  }

  async updateTier(id: string, input: PriceTierInput): Promise<PriceTierDto> {
    await this.writeTiers(input.name, async (tx) => {
      const tier = await tx.priceTier.findUnique({ where: { id } });
      if (!tier) throw new NotFoundError('Price tier');
      await checkRule(tx, id, input);
      await tx.priceTier.update({ where: { id }, data: tierFields(input) });
    });
    return this.getTier(id);
  }

  /**
   * Spec 4.3 (2): one tier is the default - the one companies without a tier are priced on.
   * The old default is cleared and the new one set in the same transaction, so there is never
   * a moment with none or two (a partial unique index backs this up).
   */
  async makeDefault(id: string): Promise<PriceTierDto> {
    await this.writeTiers(null, async (tx) => {
      const tier = await tx.priceTier.findUnique({ where: { id } });
      if (!tier) throw new NotFoundError('Price tier');
      await tx.priceTier.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      await tx.priceTier.update({ where: { id }, data: { isDefault: true } });
    });
    return this.getTier(id);
  }

  /**
   * Saves edited cells of the tier grid: a number types in (or overrides) a price, null removes
   * the typed price so the rule applies again - or, on a tier without a rule, leaves no price.
   * All changes are saved together or not at all. Orders already placed keep their own copy of
   * the prices, so this only affects new orders (spec 4.3 (8)).
   */
  async setPrices(tierId: string, changes: TierPriceChangesInput): Promise<TierGridDto> {
    const tier = await this.prisma.priceTier.findUnique({ where: { id: tierId } });
    if (!tier) throw new NotFoundError('Price tier');
    await checkIdsExist([
      {
        table: this.prisma.dish,
        ids: changes.dishes.map((change) => change.id),
        path: 'dishes',
        label: 'dishes',
      },
      {
        table: this.prisma.option,
        ids: changes.options.map((change) => change.id),
        path: 'options',
        label: 'options',
      },
    ]);

    await this.prisma.$transaction([
      ...changes.dishes.map(({ id: dishId, priceCents }) =>
        priceCents === null
          ? this.prisma.dishPrice.deleteMany({ where: { tierId, dishId } })
          : this.prisma.dishPrice.upsert({
              where: { tierId_dishId: { tierId, dishId } },
              create: { tierId, dishId, priceCents },
              update: { priceCents },
            }),
      ),
      ...changes.options.map(({ id: optionId, priceCents }) =>
        priceCents === null
          ? this.prisma.optionPrice.deleteMany({ where: { tierId, optionId } })
          : this.prisma.optionPrice.upsert({
              where: { tierId_optionId: { tierId, optionId } },
              create: { tierId, optionId, priceCents },
              update: { priceCents },
            }),
      ),
    ]);
    return this.getGrid(tierId);
  }

  private async getTier(id: string): Promise<PriceTierDto> {
    const data = await this.load();
    const tier = data.tiers.find((candidate) => candidate.id === id);
    if (!tier) throw new NotFoundError('Price tier');
    return toTierDto(tier, data);
  }

  /**
   * Runs a change to tiers in a transaction that first takes a lock, so tier changes take
   * turns. Two admins then can't build a loop between them (A from B while B from A) or make
   * two different tiers the default at the same moment.
   */
  private async writeTiers<T>(
    name: string | null,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('price-tier-rules'))`;
        return work(tx);
      });
    } catch (error) {
      if (name !== null && isUniqueViolation(error)) {
        const message = `There is already a tier called “${name}”.`;
        throw new BusinessRuleError('NAME_TAKEN', message, [{ path: 'name', message }]);
      }
      throw error;
    }
  }

  private async load(): Promise<PricingData> {
    const priced = {
      id: true,
      name: true,
      costCents: true,
      isActive: true,
      prices: { select: { tierId: true, priceCents: true } },
    } as const;
    const [tiers, dishes, options, companiesWithoutTier] = await Promise.all([
      this.prisma.priceTier.findMany({
        include: tierInclude,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.dish.findMany({ select: { ...priced, sku: true }, orderBy: { name: 'asc' } }),
      this.prisma.option.findMany({ select: priced, orderBy: { name: 'asc' } }),
      this.prisma.company.count({ where: { priceTierId: null, isActive: true } }),
    ]);
    return {
      tiers,
      rules: new Map(tiers.map((tier) => [tier.id, tierRuleFromColumns(tier)])),
      dishes: dishes.map((dish) => toPricedRow(dish, dish.sku)),
      options: options.map((option) => toPricedRow(option, null)),
      companiesWithoutTier,
    };
  }
}

/** A TIER rule must start from another tier that exists, without closing a loop. */
async function checkRule(
  tx: Prisma.TransactionClient,
  tierId: string | null,
  input: PriceTierInput,
): Promise<void> {
  if (input.ruleBasis !== 'TIER' || input.baseTierId === null) return;
  const tiers = await tx.priceTier.findMany();
  const names = new Map(tiers.map((tier) => [tier.id, tier.name]));

  if (!names.has(input.baseTierId)) {
    const message = 'That tier no longer exists. Reload and try again.';
    throw new BusinessRuleError('UNKNOWN_REFERENCE', message, [{ path: 'baseTierId', message }]);
  }
  // A brand-new tier can't be part of a loop: nothing derives from it yet.
  if (tierId === null) return;

  const rules = new Map(tiers.map((tier) => [tier.id, tierRuleFromColumns(tier)]));
  const loop = findRuleLoop(rules, tierId, input.baseTierId);
  if (loop) {
    const message =
      loop.length === 2
        ? 'A tier can’t derive its prices from itself.'
        : `That would make a loop: ${loop.map((id) => names.get(id)).join(' → ')}.`;
    throw new BusinessRuleError('PRICE_RULE_LOOP', message, [{ path: 'baseTierId', message }]);
  }
}

function tierFields(input: PriceTierInput) {
  return {
    name: input.name,
    description: input.description,
    ruleBasis: input.ruleBasis,
    baseTierId: input.baseTierId,
    multiplierBps: input.multiplierBps,
  };
}

function toPricedRow(
  item: {
    id: string;
    name: string;
    costCents: number;
    isActive: boolean;
    prices: { tierId: string; priceCents: number }[];
  },
  sku: string | null,
): PricedRow {
  return {
    id: item.id,
    name: item.name,
    sku,
    isActive: item.isActive,
    costCents: item.costCents,
    explicitPrices: new Map(item.prices.map((price) => [price.tierId, price.priceCents])),
  };
}

function toTierDto(tier: TierRow, data: PricingData): PriceTierDto {
  const countMissing = (items: PricedRow[]) =>
    items.filter(
      (item) => item.isActive && resolvePrice(data.rules, tier.id, item).source === 'MISSING',
    ).length;
  return {
    id: tier.id,
    name: tier.name,
    description: tier.description,
    isDefault: tier.isDefault,
    ruleBasis: tier.ruleBasis,
    baseTier: tier.baseTier,
    multiplierBps: tier.multiplierBps,
    companyCount: tier._count.companies + (tier.isDefault ? data.companiesWithoutTier : 0),
    missingDishCount: countMissing(data.dishes),
    missingOptionCount: countMissing(data.options),
  };
}

function toGridRow(rules: TierRules, tierId: string, item: PricedRow): TierGridRowDto {
  const resolved = resolvePrice(rules, tierId, item);
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    isActive: item.isActive,
    costCents: item.costCents,
    explicitCents: item.explicitPrices.get(tierId) ?? null,
    derivedCents: derivedPrice(rules, tierId, item),
    priceCents: resolved.priceCents,
    source: resolved.source,
  };
}
