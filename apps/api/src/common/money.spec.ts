import { centsToDollarString, dollarStringToCents, formatCents } from '@fernleaf/shared';

describe('money helpers (integer cents, no floating point)', () => {
  it('parses what people type into exact cents', () => {
    expect(dollarStringToCents('4.25')).toBe(425);
    expect(dollarStringToCents('4.2')).toBe(420);
    expect(dollarStringToCents('4')).toBe(400);
    expect(dollarStringToCents('$12.05')).toBe(1205);
    expect(dollarStringToCents(' 0.10 ')).toBe(10);
    // 0.1 + 0.2 style float problems can't happen: 19.99 is exactly 1999 cents.
    expect(dollarStringToCents('19.99')).toBe(1999);
  });

  it('refuses anything that is not a plain amount', () => {
    for (const bad of ['', 'abc', '4.255', '-1', '1,000', '4.']) {
      expect(dollarStringToCents(bad)).toBeNull();
    }
  });

  it('formats cents for inputs and for display', () => {
    expect(centsToDollarString(425)).toBe('4.25');
    expect(centsToDollarString(5)).toBe('0.05');
    expect(centsToDollarString(-150)).toBe('-1.50');
    expect(formatCents(123456)).toBe('$1,234.56');
  });
});
