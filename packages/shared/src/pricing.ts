import { z } from 'zod';

/**
 * Price tiers (spec 4.3). A tier holds prices typed in by staff, and can have a rule that
 * works out every price nobody typed: "cost x 2.4" or "Standard price + 15%". Derived prices
 * round up to the next 5 cents. An item with neither has no price on that tier, so it is
 * hidden from the menus of companies on that tier.
 */

/** Where a tier's untyped prices come from: nowhere, the item's cost, or another tier. */
export const PRICE_RULE_BASES = ['NONE', 'COST', 'TIER'] as const;
export type PriceRuleBasis = (typeof PRICE_RULE_BASES)[number];

/** Multipliers are basis points: 24 000 = x 2.4. Allowed range x 0.01 to x 10. */
export const MULTIPLIER_BPS_MIN = 100;
export const MULTIPLIER_BPS_MAX = 100_000;

const multiplierBps = z
  .number({ message: 'Enter a multiplier, e.g. 2.4.' })
  .int({ message: 'Use at most 4 decimal places.' })
  .min(MULTIPLIER_BPS_MIN, { message: 'Use at least 0.01.' })
  .max(MULTIPLIER_BPS_MAX, { message: 'Use at most 10.' });

/** Body of POST /api/pricing/tiers and PUT /api/pricing/tiers/:id */
export const priceTierInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: 'Enter a name.' })
      .max(40, { message: 'Keep it under 40 characters.' }),
    description: z.string().trim().max(200).default(''),
    ruleBasis: z.enum(PRICE_RULE_BASES),
    /** The tier to start from (TIER rules only). */
    baseTierId: z.string().min(1).nullable().default(null),
    /** COST and TIER rules only. */
    multiplierBps: multiplierBps.nullable().default(null),
  })
  .superRefine((tier, ctx) => {
    if (tier.ruleBasis !== 'NONE' && tier.multiplierBps === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['multiplierBps'],
        message: 'Enter a multiplier, e.g. 2.4.',
      });
    }
    if (tier.ruleBasis === 'TIER' && tier.baseTierId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseTierId'],
        message: 'Pick the tier to start from.',
      });
    }
  })
  // Values that don't belong to the chosen rule are dropped, so switching rules in a form
  // can't leave a stale base tier or multiplier behind.
  .transform((tier) => ({
    ...tier,
    baseTierId: tier.ruleBasis === 'TIER' ? tier.baseTierId : null,
    multiplierBps: tier.ruleBasis === 'NONE' ? null : tier.multiplierBps,
  }));

export type PriceTierInput = z.infer<typeof priceTierInputSchema>;

const priceChange = z.object({
  id: z.string().min(1),
  /** The price to type in, or null to remove the typed price (back to the rule, or no price). */
  priceCents: z
    .number({ message: 'Enter a price.' })
    .int({ message: 'Use whole cents.' })
    .min(0, { message: 'Can’t be negative.' })
    .max(10_000_000, { message: 'That’s too much.' })
    .nullable(),
});

function uniqueIds(changes: { id: string }[]): boolean {
  return new Set(changes.map((change) => change.id)).size === changes.length;
}

/** Body of PUT /api/pricing/tiers/:id/prices - the edited cells of the tier grid. */
export const tierPriceChangesSchema = z
  .object({
    dishes: z
      .array(priceChange)
      .max(1000)
      .default([])
      .refine(uniqueIds, { message: 'Each dish can only be changed once.' }),
    options: z
      .array(priceChange)
      .max(1000)
      .default([])
      .refine(uniqueIds, { message: 'Each option can only be changed once.' }),
  })
  .refine((changes) => changes.dishes.length + changes.options.length > 0, {
    message: 'Nothing to save.',
  });

export type TierPriceChangesInput = z.infer<typeof tierPriceChangesSchema>;

export interface PriceTierDto {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  ruleBasis: PriceRuleBasis;
  baseTier: { id: string; name: string } | null;
  multiplierBps: number | null;
  /** Companies priced on this tier: those assigned to it, plus (default tier) those with none. */
  companyCount: number;
  /** Active dishes and options with no price here - hidden from menus that use this tier. */
  missingDishCount: number;
  missingOptionCount: number;
}

/**
 * Where an item's price on a tier comes from: typed in on the tier (EXPLICIT), worked out by
 * the tier's rule (DERIVED), or nowhere (MISSING - the item is hidden, never shown at $0).
 */
export type PriceSource = 'EXPLICIT' | 'DERIVED' | 'MISSING';

/** One dish or option in the tier grid. */
export interface TierGridRowDto {
  id: string;
  name: string;
  /** Dishes only. */
  sku: string | null;
  isActive: boolean;
  costCents: number;
  /** The price typed in on this tier, if any. It wins over the rule. */
  explicitCents: number | null;
  /** What the tier's rule gives, ignoring a typed price; null if the rule gives nothing. */
  derivedCents: number | null;
  /** What employees on this tier pay: typed, else derived, else no price. */
  priceCents: number | null;
  source: PriceSource;
}

export interface TierGridDto {
  tier: PriceTierDto;
  dishes: TierGridRowDto[];
  options: TierGridRowDto[];
}
