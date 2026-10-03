import { deriveCents } from '@fernleaf/shared';
import {
  derivedPrice,
  findRuleLoop,
  resolvePrice,
  tierForCompany,
  type PricedItem,
  type TierRule,
  type TierRules,
} from './pricing.js';

/** Standard: typed in by hand. Plus15: Standard + 15%. Markup: cost x 2.4. Chained: Markup + 15%. */
const rules: TierRules = new Map<string, TierRule>([
  ['standard', { basis: 'NONE' }],
  ['plus15', { basis: 'TIER', baseTierId: 'standard', multiplierBps: 11_500 }],
  ['markup', { basis: 'COST', multiplierBps: 24_000 }],
  ['chained', { basis: 'TIER', baseTierId: 'markup', multiplierBps: 11_500 }],
]);

function item(costCents: number, explicit: Record<string, number> = {}): PricedItem {
  return { costCents, explicitPrices: new Map(Object.entries(explicit)) };
}

describe('deriveCents (multiply, then round up to the next 5 cents)', () => {
  it('rounds $2.11 up to $2.15, as in the spec', () => {
    expect(deriveCents(100, 21_100)).toBe(215);
    expect(deriveCents(88, 24_000)).toBe(215); // 88 x 2.4 = 211.2 cents
  });

  it('leaves exact multiples of 5 cents alone', () => {
    expect(deriveCents(100, 21_500)).toBe(215);
    expect(deriveCents(1_000, 11_500)).toBe(1_150);
    expect(deriveCents(0, 24_000)).toBe(0);
  });

  it('rounds any fraction of a step up, never down', () => {
    expect(deriveCents(1, 10_000)).toBe(5);
    expect(deriveCents(1_001, 10_000)).toBe(1_005);
    expect(deriveCents(333, 3_334)).toBe(115); // 111.0222 cents
  });

  it('stays exact for very large amounts (no floating point)', () => {
    expect(deriveCents(9_999_999, 100_000)).toBe(99_999_990);
    // 9 999 999 999 x 9.9999 = 99 998 999 990.0001 cents -> rounds up to ...995
    expect(deriveCents(9_999_999_999, 99_999)).toBe(99_998_999_995);
  });
});

describe('resolvePrice', () => {
  it('uses a typed price exactly as entered, even on a tier with a rule', () => {
    expect(resolvePrice(rules, 'markup', item(100, { markup: 211 }))).toEqual({
      priceCents: 211,
      source: 'EXPLICIT',
    });
  });

  it('treats a typed $0 as a real price, not a missing one', () => {
    expect(resolvePrice(rules, 'standard', item(100, { standard: 0 }))).toEqual({
      priceCents: 0,
      source: 'EXPLICIT',
    });
  });

  it('has no price on a tier without a rule when nothing is typed', () => {
    expect(resolvePrice(rules, 'standard', item(100))).toEqual({
      priceCents: null,
      source: 'MISSING',
    });
  });

  it('derives "cost x 2.4" from the item cost', () => {
    expect(resolvePrice(rules, 'markup', item(350))).toEqual({
      priceCents: 840,
      source: 'DERIVED',
    });
  });

  it('derives "Standard + 15%" from the Standard price', () => {
    expect(resolvePrice(rules, 'plus15', item(100, { standard: 1_090 }))).toEqual({
      priceCents: 1_255, // 1 090 x 1.15 = 1 253.5
      source: 'DERIVED',
    });
  });

  it('rounds at every step of a chain', () => {
    // markup: 88 x 2.4 = 211.2 -> 215; chained: 215 x 1.15 = 247.25 -> 250.
    // (Rounding only once at the end would give 88 x 2.76 = 242.88 -> 245.)
    expect(resolvePrice(rules, 'chained', item(88)).priceCents).toBe(250);
  });

  it('builds on a price typed on the base tier', () => {
    expect(resolvePrice(rules, 'chained', item(88, { markup: 300 })).priceCents).toBe(345);
  });

  it('has no price when the base tier has none', () => {
    expect(resolvePrice(rules, 'plus15', item(100))).toEqual({
      priceCents: null,
      source: 'MISSING',
    });
  });
});

describe('derivedPrice', () => {
  it('shows what the rule gives even when a typed price overrides it', () => {
    expect(derivedPrice(rules, 'plus15', item(100, { standard: 1_000, plus15: 999 }))).toBe(1_150);
  });

  it('refuses to follow a loop in bad data instead of spinning forever', () => {
    const looped: TierRules = new Map<string, TierRule>([
      ['a', { basis: 'TIER', baseTierId: 'b', multiplierBps: 10_000 }],
      ['b', { basis: 'TIER', baseTierId: 'a', multiplierBps: 10_000 }],
    ]);
    expect(() => derivedPrice(looped, 'a', item(100))).toThrow('a -> b -> a');
  });
});

describe('findRuleLoop', () => {
  it('finds a tier deriving from itself', () => {
    expect(findRuleLoop(rules, 'standard', 'standard')).toEqual(['standard', 'standard']);
  });

  it('finds a loop through other tiers', () => {
    // standard <- plus15 already; standard from plus15 would close the loop.
    expect(findRuleLoop(rules, 'standard', 'plus15')).toEqual(['standard', 'plus15', 'standard']);
    expect(findRuleLoop(rules, 'markup', 'chained')).toEqual(['markup', 'chained', 'markup']);
  });

  it('allows chains without a loop', () => {
    expect(findRuleLoop(rules, 'markup', 'plus15')).toBeNull();
    expect(findRuleLoop(rules, 'new-tier', 'chained')).toBeNull();
  });
});

describe('tierForCompany', () => {
  it("uses the company's tier, or the default tier when it has none", () => {
    expect(tierForCompany('partner', 'standard')).toBe('partner');
    expect(tierForCompany(null, 'standard')).toBe('standard');
  });
});
