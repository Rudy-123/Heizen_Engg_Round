import { deriveCents, type PriceRuleBasis, type PriceSource } from '@fernleaf/shared';

/**
 * Price resolution (spec 4.3) as pure functions: no database. Callers pass in every tier's
 * rule and an item's typed prices; these functions work out what the item costs on a tier
 * and where that price came from.
 *
 *   price on a tier = the price typed in on that tier, if there is one
 *                   = otherwise the tier's rule:  cost x N   or   another tier's price x N,
 *                     rounded up to the next 5 cents at every step
 *                   = otherwise no price (null) - and null is never the same as $0
 */

export type TierRule =
  | { basis: 'NONE' }
  | { basis: 'COST'; multiplierBps: number }
  | { basis: 'TIER'; baseTierId: string; multiplierBps: number };

/** Every tier's rule, by tier id. */
export type TierRules = ReadonlyMap<string, TierRule>;

/** A dish or an option: what it costs to make, and the prices typed in for it, by tier id. */
export interface PricedItem {
  costCents: number;
  explicitPrices: ReadonlyMap<string, number>;
}

export interface ResolvedPrice {
  priceCents: number | null;
  source: PriceSource;
}

/** Builds a rule from the tier's database columns (a CHECK constraint keeps them consistent). */
export function tierRuleFromColumns(tier: {
  id: string;
  ruleBasis: PriceRuleBasis;
  baseTierId: string | null;
  multiplierBps: number | null;
}): TierRule {
  if (tier.ruleBasis === 'NONE') return { basis: 'NONE' };
  if (tier.multiplierBps === null) throw new Error(`Tier ${tier.id} has a rule but no multiplier`);
  if (tier.ruleBasis === 'COST') return { basis: 'COST', multiplierBps: tier.multiplierBps };
  if (tier.baseTierId === null) throw new Error(`Tier ${tier.id} derives from no tier`);
  return { basis: 'TIER', baseTierId: tier.baseTierId, multiplierBps: tier.multiplierBps };
}

/** The price of `item` on tier `tierId`, and where it came from. */
export function resolvePrice(rules: TierRules, tierId: string, item: PricedItem): ResolvedPrice {
  const explicit = item.explicitPrices.get(tierId);
  if (explicit !== undefined) return { priceCents: explicit, source: 'EXPLICIT' };
  const derived = derivedPrice(rules, tierId, item);
  return derived === null
    ? { priceCents: null, source: 'MISSING' }
    : { priceCents: derived, source: 'DERIVED' };
}

/**
 * What the tier's rule gives for `item`, ignoring any price typed on this tier. A tier that
 * derives from another tier starts from that tier's full price - typed or derived.
 */
export function derivedPrice(
  rules: TierRules,
  tierId: string,
  item: PricedItem,
  visited: readonly string[] = [],
): number | null {
  if (visited.includes(tierId)) {
    // Saving a rule refuses loops, so this only guards against bad data.
    throw new Error(`Price tier rules loop: ${[...visited, tierId].join(' -> ')}`);
  }
  const rule = rules.get(tierId);
  if (!rule) throw new Error(`Unknown price tier ${tierId}`);

  switch (rule.basis) {
    case 'NONE':
      return null;
    case 'COST':
      return deriveCents(item.costCents, rule.multiplierBps);
    case 'TIER': {
      const base =
        item.explicitPrices.get(rule.baseTierId) ??
        derivedPrice(rules, rule.baseTierId, item, [...visited, tierId]);
      return base === null ? null : deriveCents(base, rule.multiplierBps);
    }
  }
}

/**
 * Would letting `tierId` derive from `baseTierId` create a loop (A from B, B from A)? Follows
 * the chain of base tiers; returns the loop (e.g. [A, B, A]) or null if there is none.
 */
export function findRuleLoop(
  rules: TierRules,
  tierId: string,
  baseTierId: string,
): string[] | null {
  const chain = [tierId];
  let current: string | undefined = baseTierId;
  while (current !== undefined && !chain.includes(current)) {
    chain.push(current);
    const rule = rules.get(current);
    current = rule?.basis === 'TIER' ? rule.baseTierId : undefined;
  }
  return current === tierId ? [...chain, tierId] : null;
}

/** Spec 4.3 (4): employees are priced on their company's tier, or the default tier if it has none. */
export function tierForCompany(companyTierId: string | null, defaultTierId: string): string {
  return companyTierId ?? defaultTierId;
}
