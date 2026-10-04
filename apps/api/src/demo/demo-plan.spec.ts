import type { MenuDishDto } from '@fernleaf/shared';
import {
  choicesFor,
  planDrop,
  planFate,
  planKitchenReady,
  planLines,
  planUnit,
  randomFor,
} from './demo-plan.js';

const dish = (id: string, extra: Partial<MenuDishDto> = {}): MenuDishDto => ({
  menuItemId: `item-${id}`,
  dishId: id,
  name: id,
  description: '',
  imageUrl: null,
  temperature: 'HOT',
  minOrderQuantity: null,
  priceCents: 500,
  allergens: [],
  dietaryTags: [],
  allergyWarnings: [],
  optionGroups: [],
  ...extra,
});

const bowl = dish('bowl', {
  optionGroups: [
    {
      id: 'protein',
      name: 'Protein',
      isRequired: true,
      maxSelections: 1,
      usesPortions: false,
      options: ['paneer', 'tofu'].map((id) => ({
        id,
        name: id,
        priceCents: 100,
        allergens: [],
        dietaryTags: [],
        sizes: [],
      })),
    },
    {
      id: 'rice',
      name: 'Rice',
      isRequired: true,
      maxSelections: 1,
      usesPortions: true,
      options: [
        {
          id: 'jeera',
          name: 'Jeera rice',
          priceCents: 0,
          allergens: [],
          dietaryTags: [],
          sizes: [
            { portionSizeId: 'regular', name: 'Regular', extraChargeCents: 0 },
            { portionSizeId: 'large', name: 'Large', extraChargeCents: 40 },
          ],
        },
      ],
    },
    {
      id: 'sides',
      name: 'Sides',
      isRequired: false,
      maxSelections: 2,
      usesPortions: false,
      options: ['raita', 'papad', 'salad'].map((id) => ({
        id,
        name: id,
        priceCents: 30,
        allergens: [],
        dietaryTags: [],
        sizes: [],
      })),
    },
  ],
});

describe('randomFor', () => {
  it('gives the same sequence for the same seed, and a different one for another', () => {
    const a = randomFor('2027-06-07');
    const b = randomFor('2027-06-07');
    const c = randomFor('2027-06-08');
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});

describe('choicesFor', () => {
  it('always answers required groups, with a size when the group sells portions', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const choices = choicesFor(randomFor(`c${seed}`), bowl);
      expect(choices.filter((c) => c.groupId === 'protein')).toHaveLength(1);
      const rice = choices.filter((c) => c.groupId === 'rice');
      expect(rice).toHaveLength(1);
      expect(['regular', 'large']).toContain(rice[0]?.portionSizeId);
      expect(choices.filter((c) => c.groupId === 'sides').length).toBeLessThanOrEqual(2);
    }
  });
});

describe('planLines', () => {
  it('builds lines whose combinations add up, without repeating a dish', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const lines = planLines(
        randomFor(`l${seed}`),
        [bowl, dish('dosa'), dish('thali')],
        new Set(),
      );
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(new Set(lines.map((l) => l.dishId)).size).toBe(lines.length);
      for (const line of lines) {
        expect(line.combinations.reduce((sum, c) => sum + c.quantity, 0)).toBe(line.quantity);
      }
    }
  });

  it('respects a minimum order quantity and mostly avoids the employee’s allergens', () => {
    const peanut = { id: 'peanut', name: 'Peanuts' };
    const satay = dish('satay', { allergens: [peanut] });
    const platter = dish('platter', { minOrderQuantity: 3 });
    let satayOrders = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const lines = planLines(randomFor(`a${seed}`), [satay, platter], new Set(['peanut']));
      for (const line of lines) {
        if (line.dishId === 'platter') expect(line.quantity).toBeGreaterThanOrEqual(3);
        if (line.dishId === 'satay') satayOrders += 1;
      }
    }
    expect(satayOrders).toBeGreaterThan(0); // a few slip through, so the kitchen sees warnings
    expect(satayOrders).toBeLessThan(30);
  });
});

describe('timing', () => {
  const planned = new Date('2027-06-07T05:30:00Z'); // 11:00 IST

  it('mostly finishes cooking before the planned time, and sometimes late', () => {
    const offsets = Array.from({ length: 400 }, (_, seed) =>
      Math.round(
        (planKitchenReady(randomFor(`k${seed}`), planned).getTime() - planned.getTime()) / 60_000,
      ),
    );
    const late = offsets.filter((m) => m > 0).length;
    expect(late).toBeGreaterThan(10);
    expect(late).toBeLessThan(80);
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-25);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(25);
  });

  it('starts a unit before it is done', () => {
    const { startAt, doneAt } = planUnit(randomFor('u'), planned);
    expect(startAt < doneAt).toBe(true);
    expect(doneAt <= planned).toBe(true);
  });

  it('packs after the kitchen, leaves after packing, and delivers after leaving', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const drop = planDrop(randomFor(`d${seed}`), {
        kitchenReadyAt: planned,
        plannedDispatchReadyAt: new Date('2027-06-07T06:00:00Z'),
        deliveryAt: new Date('2027-06-07T07:00:00Z'),
      });
      expect(drop.readyAt > planned).toBe(true);
      expect(drop.outAt > drop.readyAt).toBe(true);
      expect(drop.deliveredAt.getTime() - drop.outAt.getTime()).toBeGreaterThanOrEqual(15 * 60_000);
    }
  });

  it('keeps more drafts while the cut-off is still ahead', () => {
    const drafts = (ahead: boolean) =>
      Array.from({ length: 500 }, (_, seed) => planFate(randomFor(`f${seed}`), ahead)).filter(
        (fate) => fate === 'DRAFT',
      ).length;
    expect(drafts(true)).toBeGreaterThan(drafts(false));
  });
});
