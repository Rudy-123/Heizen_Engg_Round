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
