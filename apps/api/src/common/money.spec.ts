import {
  bpsToMultiplierString,
  bpsToPercentChange,
  centsToDollarString,
  dollarStringToCents,
  formatCents,
  multiplierStringToBps,
} from '@fernleaf/shared';

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

  it('parses and formats multipliers as exact basis points', () => {
    expect(multiplierStringToBps('2.4')).toBe(24_000);
    expect(multiplierStringToBps('1.15')).toBe(11_500);
    expect(multiplierStringToBps('x2')).toBe(20_000);
    expect(multiplierStringToBps('0.9999')).toBe(9_999);
    for (const bad of ['', '1.23456', '-1', '1,5', 'abc']) {
      expect(multiplierStringToBps(bad)).toBeNull();
    }
    expect(bpsToMultiplierString(24_000)).toBe('2.4');
    expect(bpsToMultiplierString(11_500)).toBe('1.15');
    expect(bpsToMultiplierString(10_000)).toBe('1');
    expect(bpsToMultiplierString(9_999)).toBe('0.9999');
    expect(bpsToPercentChange(11_500)).toBe('+15%');
    expect(bpsToPercentChange(9_000)).toBe('-10%');
    expect(bpsToPercentChange(10_050)).toBe('+0.5%');
    expect(bpsToPercentChange(24_000)).toBe('+140%');
  });

  it('formats cents for inputs and for display', () => {
    expect(centsToDollarString(425)).toBe('4.25');
    expect(centsToDollarString(5)).toBe('0.05');
    expect(centsToDollarString(-150)).toBe('-1.50');
    expect(formatCents(123456)).toBe('$1,234.56');
  });
});
