/**
 * Money is always an integer number of cents. These helpers convert to and from what people
 * type and read, using string arithmetic only - floating point never touches a price.
 */

const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** 425 -> "$4.25" */
export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

/** 425 -> "4.25" (for an input box) */
export function centsToDollarString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** "4.25" -> 425, "4" -> 400, "4.5" -> 450; anything else (e.g. "4.255", "abc") -> null */
export function dollarStringToCents(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/^\$/, ''));
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  return dollars * 100 + cents;
}

// ---------------------------------------------------------------------------
// Multipliers, stored as basis points: 24000 = x 2.4, 11500 = + 15 %
// ---------------------------------------------------------------------------

/**
 * A price worked out from another amount: `cents x multiplier`, rounded UP to the next
 * 5 cents (spec 4.3: $2.11 becomes $2.15; $2.15 stays $2.15).
 *
 * Integer maths only: cents x basis points is the exact price in 1/10 000ths of a cent, and
 * 5 cents is 50 000 of those, so we count how many whole 5-cent steps are needed, rounding up.
 * BigInt keeps the multiplication exact however large the numbers get.
 */
export function deriveCents(cents: number, multiplierBps: number): number {
  const exact = BigInt(cents) * BigInt(multiplierBps);
  const fiveCents = 50_000n;
  const steps = (exact + fiveCents - 1n) / fiveCents;
  return Number(steps * 5n);
}

/** "2.4" -> 24000, "1.15" -> 11500, "x2" -> 20000; anything else (e.g. "1.23456", "-1") -> null */
export function multiplierStringToBps(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(text.trim().replace(/^[x×]\s*/i, ''));
  if (!match) return null;
  return Number(match[1]) * 10_000 + Number((match[2] ?? '').padEnd(4, '0'));
}

/** 24000 -> "2.4", 11500 -> "1.15", 10000 -> "1" (for an input box) */
export function bpsToMultiplierString(bps: number): string {
  const whole = Math.floor(bps / 10_000);
  const fraction = String(bps % 10_000)
    .padStart(4, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** 11500 -> "+15%", 9000 -> "-10%", 10050 -> "+0.5%" (how a tier compares to its base) */
export function bpsToPercentChange(bps: number): string {
  const change = bps - 10_000;
  const abs = Math.abs(change);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${change < 0 ? '-' : '+'}${fraction ? `${whole}.${fraction}` : whole}%`;
}
