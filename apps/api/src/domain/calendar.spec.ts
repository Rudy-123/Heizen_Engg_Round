import {
  addDays,
  cutoffDate,
  cutoffInstant,
  deliveryDateProblems,
  isPastCutoff,
  todayIn,
  weekdayOf,
  zonedInstant,
  type WorkCalendar,
} from './calendar.js';

// October 2026: Thu 1, Fri 2, Sat 3, Sun 4, Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Sat 10, Sun 11, Mon 12.
const IST = 'Asia/Kolkata';
const MON_TO_FRI = [1, 2, 3, 4, 5];
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
const SPEC_RULE = { cutoffTimeMinutes: 16 * 60, cutoffDaysBefore: 2 };

function calendar(workingDays: number[], holidays: string[] = []): WorkCalendar {
  return { workingDays, holidays: new Set(holidays) };
}

describe('calendar helpers', () => {
  it('knows weekdays and adds days across month ends', () => {
    expect(weekdayOf('2026-10-07')).toBe(3); // Wednesday
    expect(weekdayOf('2026-10-04')).toBe(7); // Sunday
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('rejects malformed dates', () => {
    expect(() => weekdayOf('2026-13-01')).toThrow();
    expect(() => weekdayOf('7 Oct 2026')).toThrow();
    expect(() => cutoffDate('2026-02-30', calendar(MON_TO_FRI), 0)).toThrow();
  });

  it('turns a kitchen date and time into the right instant', () => {
    expect(zonedInstant('2026-10-05', 960, IST).toISOString()).toBe('2026-10-05T10:30:00.000Z');
  });

  it("works out the kitchen's today from an instant, not from the server's zone", () => {
    const fridayEveningUtc = new Date('2026-10-02T20:00:00Z'); // 01:30 Saturday in India
    expect(todayIn(IST, fridayEveningUtc)).toBe('2026-10-03');
    expect(todayIn('America/Los_Angeles', fridayEveningUtc)).toBe('2026-10-02');
  });
});

describe('cutoffDate / cutoffInstant (spec 4.6)', () => {
  it('matches the spec example: 2 working days at 16:00 -> a Wednesday delivery locks Monday 16:00', () => {
    const kitchen = calendar(MON_TO_FRI);
    expect(cutoffDate('2026-10-07', kitchen, 2)).toBe('2026-10-05');
    expect(cutoffInstant('2026-10-07', kitchen, SPEC_RULE, IST).toISOString()).toBe(
      '2026-10-05T10:30:00.000Z', // Monday 16:00 in India
    );
  });

  it('skips kitchen non-working days when counting back', () => {
    // Monday delivery: Fri (1), Thu (2) - the weekend doesn't count.
    expect(cutoffDate('2026-10-12', calendar(MON_TO_FRI), 2)).toBe('2026-10-08');
    expect(cutoffDate('2026-10-12', calendar(MON_TO_FRI), 1)).toBe('2026-10-09');
  });

  it('skips kitchen holidays when counting back', () => {
    // Tuesday is a kitchen holiday: Mon (1), weekend skipped, Fri (2).
    expect(cutoffDate('2026-10-07', calendar(MON_TO_FRI, ['2026-10-06']), 2)).toBe('2026-10-02');
  });

  it('counts every day when the kitchen works seven days a week', () => {
    expect(cutoffDate('2026-10-07', calendar(EVERY_DAY), 2)).toBe('2026-10-05');
    expect(cutoffDate('2026-10-12', calendar(EVERY_DAY), 2)).toBe('2026-10-10');
  });

  it('with 0 days, locks on the delivery day itself', () => {
    expect(cutoffDate('2026-10-07', calendar(MON_TO_FRI), 0)).toBe('2026-10-07');
  });

  it('refuses a kitchen calendar with no working days instead of looping forever', () => {
    expect(() => cutoffDate('2026-10-07', calendar([]), 2)).toThrow(/no working days/);
  });

  it('handles a daylight-saving change in a zone that has one', () => {
    // New York moves to daylight time on Sun 8 Mar 2026 (UTC-5 -> UTC-4).
    const kitchen = calendar(MON_TO_FRI);
    const ny = 'America/New_York';
    // Tue 10 Mar locks Fri 6 Mar 16:00 EST = 21:00 UTC
    expect(cutoffInstant('2026-03-10', kitchen, SPEC_RULE, ny).toISOString()).toBe(
      '2026-03-06T21:00:00.000Z',
    );
    // Wed 11 Mar locks Mon 9 Mar 16:00 EDT = 20:00 UTC
    expect(cutoffInstant('2026-03-11', kitchen, SPEC_RULE, ny).toISOString()).toBe(
      '2026-03-09T20:00:00.000Z',
    );
  });

  it("gives the same answer whatever the server's own time zone is", () => {
    const original = process.env['TZ'];
    try {
      const results = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Kolkata'].map((zone) => {
        process.env['TZ'] = zone;
        return [
          cutoffInstant('2026-10-07', calendar(MON_TO_FRI), SPEC_RULE, IST).toISOString(),
          todayIn(IST, new Date('2026-10-02T20:00:00Z')),
        ].join(' ');
      });
      expect(new Set(results)).toEqual(new Set(['2026-10-05T10:30:00.000Z 2026-10-03']));
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });
});

describe('isPastCutoff', () => {
  const kitchen = calendar(MON_TO_FRI);
  const at = (iso: string) => new Date(iso);

  it('is open until the cut-off instant and locked from it onwards', () => {
    expect(isPastCutoff('2026-10-07', at('2026-10-05T10:29:59Z'), kitchen, SPEC_RULE, IST)).toBe(
      false,
    );
    expect(isPastCutoff('2026-10-07', at('2026-10-05T10:30:00Z'), kitchen, SPEC_RULE, IST)).toBe(
      true,
    );
    expect(isPastCutoff('2026-10-07', at('2026-10-06T08:00:00Z'), kitchen, SPEC_RULE, IST)).toBe(
      true,
    );
  });
});

describe('deliveryDateProblems', () => {
  const today = '2026-10-05';

  it('accepts a day when both the kitchen and the company are open', () => {
    expect(
      deliveryDateProblems('2026-10-07', {
        today,
        kitchen: calendar(MON_TO_FRI),
        company: calendar(MON_TO_FRI),
      }),
    ).toEqual([]);
  });

  it('refuses past dates, kitchen closures and company closures', () => {
    expect(
      deliveryDateProblems('2026-10-02', {
        today,
        kitchen: calendar(MON_TO_FRI),
        company: calendar(MON_TO_FRI),
      }),
    ).toEqual(['IN_THE_PAST']);
    expect(
      deliveryDateProblems('2026-10-11', {
        today,
        kitchen: calendar(MON_TO_FRI),
        company: calendar(EVERY_DAY),
      }),
    ).toEqual(['KITCHEN_CLOSED']); // Sunday
    expect(
      deliveryDateProblems('2026-10-10', {
        today,
        kitchen: calendar(EVERY_DAY),
        company: calendar(MON_TO_FRI),
      }),
    ).toEqual(['COMPANY_CLOSED']); // Saturday
  });

  it('a company holiday blocks the delivery date but never moves the cut-off', () => {
    const kitchen = calendar(MON_TO_FRI);
    const companyWithHoliday = calendar(MON_TO_FRI, ['2026-10-06']);
    expect(
      deliveryDateProblems('2026-10-06', { today, kitchen, company: companyWithHoliday }),
    ).toEqual(['COMPANY_CLOSED']);
    // The cut-off only ever looks at the kitchen calendar: Wed 7 still locks Mon 5.
    expect(cutoffDate('2026-10-07', kitchen, 2)).toBe('2026-10-05');
  });
});
