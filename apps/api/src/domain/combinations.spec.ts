import type { MenuDishDto } from '@fernleaf/shared';
import {
  priceOrderLines,
  signatureOf,
  type LineRequest,
  type LockedCombination,
  type OrderableDish,
} from './combinations.js';
import { orderActionProblem, plannedTimes, type OrderActionContext } from './order-rules.js';

/** A rice bowl: a required protein, rice in two sizes, optional sides (up to 2). */
const bowl: MenuDishDto = {
  menuItemId: 'item-1',
  dishId: 'bowl',
  name: 'Paneer rice bowl',
  description: '',
  imageUrl: null,
  temperature: 'HOT',
  minOrderQuantity: null,
  priceCents: 500,
  allergens: [],
  dietaryTags: [],
  allergyWarnings: [],
  optionGroups: [
    {
      id: 'protein',
      name: 'Choose your protein',
      isRequired: true,
      maxSelections: 1,
      usesPortions: false,
      options: [
        {
          id: 'paneer',
          name: 'Paneer',
          priceCents: 150,
          allergens: [],
          dietaryTags: [],
          sizes: [],
        },
        { id: 'tofu', name: 'Tofu', priceCents: 120, allergens: [], dietaryTags: [], sizes: [] },
      ],
    },
    {
      id: 'rice',
      name: 'Choose your rice',
      isRequired: true,
      maxSelections: 1,
      usesPortions: true,
      options: [
        {
          id: 'brown',
          name: 'Brown rice',
          priceCents: 50,
          allergens: [],
          dietaryTags: [],
          sizes: [
            { portionSizeId: 'regular', name: 'Regular', extraChargeCents: 0 },
            { portionSizeId: 'large', name: 'Large', extraChargeCents: 45 },
          ],
        },
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
      name: 'Add sides',
      isRequired: false,
      maxSelections: 2,
      usesPortions: false,
      options: [
        { id: 'raita', name: 'Raita', priceCents: 60, allergens: [], dietaryTags: [], sizes: [] },
        { id: 'papad', name: 'Papad', priceCents: 30, allergens: [], dietaryTags: [], sizes: [] },
        { id: 'salad', name: 'Salad', priceCents: 50, allergens: [], dietaryTags: [], sizes: [] },
      ],
    },
  ],
};

const menu = new Map<string, OrderableDish>([
  ['bowl', { dish: bowl, sku: 'BWL-1', costCents: 180, optionCosts: new Map([['paneer', 80]]) }],
  [
    'dosa',
    {
      dish: {
        ...bowl,
        dishId: 'dosa',
        name: 'Dosa',
        priceCents: 300,
        optionGroups: [],
        minOrderQuantity: 2,
      },
      sku: 'DSA-1',
      costCents: 90,
      optionCosts: new Map(),
    },
  ],
]);

const paneerBrown = [
  { groupId: 'protein', optionId: 'paneer', portionSizeId: null },
  { groupId: 'rice', optionId: 'brown', portionSizeId: 'regular' },
];
const tofuJeeraLarge = [
  { groupId: 'protein', optionId: 'tofu', portionSizeId: null },
  { groupId: 'rice', optionId: 'jeera', portionSizeId: 'large' },
];

function line(
  quantity: number,
  ...combinations: [number, LineRequest['combinations'][0]['choices']][]
) {
  return {
    dishId: 'bowl',
    quantity,
    combinations: combinations.map(([q, choices]) => ({ quantity: q, choices })),
  } satisfies LineRequest;
}

const messages = (result: ReturnType<typeof priceOrderLines>) =>
  result.problems.map((p) => `${p.path}: ${p.message}`);

describe('priceOrderLines - the spec example (10 bowls: 6 one way, 4 another)', () => {
  it('prices each combination as (dish + chosen options) x its quantity', () => {
    const result = priceOrderLines([line(10, [6, paneerBrown], [4, tofuJeeraLarge])], menu);
    expect(result.problems).toEqual([]);
    const [priced] = result.lines;
    // 500 + 150 paneer + 50 brown rice = 700 x 6 = 4 200
    // 500 + 120 tofu + 0 jeera + 40 large = 660 x 4 = 2 640
    expect(priced?.combinations.map((c) => [c.quantity, c.unitPriceCents, c.totalCents])).toEqual([
      [6, 700, 4_200],
      [4, 660, 2_640],
    ]);
    expect(priced?.lineTotalCents).toBe(6_840);
    expect(result.totalCents).toBe(6_840);
  });

  it('snapshots names, sizes, prices and costs of every choice', () => {
    const [priced] = priceOrderLines([line(1, [1, paneerBrown])], menu).lines;
    expect(priced).toMatchObject({
      dishName: 'Paneer rice bowl',
      dishSku: 'BWL-1',
      dishUnitCostCents: 180,
    });
    expect(priced?.combinations[0]?.options).toEqual([
      expect.objectContaining({
        optionName: 'Paneer',
        groupName: 'Choose your protein',
        priceCents: 150,
        costCents: 80,
      }),
      expect.objectContaining({ optionName: 'Brown rice', portionName: 'Regular', priceCents: 50 }),
    ]);
  });
});

describe('priceOrderLines - rules', () => {
  it('the combinations must add up exactly to the line quantity', () => {
    expect(
      messages(priceOrderLines([line(10, [6, paneerBrown], [3, tofuJeeraLarge])], menu)),
    ).toEqual(['lines.0.combinations: The combinations add up to 9, but the line is for 10.']);
  });

  it('every combination answers every required group', () => {
    const result = priceOrderLines(
      [line(2, [2, [{ groupId: 'protein', optionId: 'tofu', portionSizeId: null }]])],
      menu,
    );
    expect(messages(result)).toEqual([
      'lines.0.combinations.0.choices: “Choose your rice” needs a choice.',
    ]);
  });

  it('a group can’t have more than its maximum picks', () => {
    const tooMany = [
      ...paneerBrown,
      { groupId: 'sides', optionId: 'raita', portionSizeId: null },
      { groupId: 'sides', optionId: 'papad', portionSizeId: null },
      { groupId: 'sides', optionId: 'salad', portionSizeId: null },
    ];
    expect(messages(priceOrderLines([line(1, [1, tooMany])], menu))).toEqual([
      'lines.0.combinations.0.choices: “Add sides” allows at most 2.',
    ]);
  });

  it('a portioned group needs a size; other groups must not have one', () => {
    const noSize = [
      { groupId: 'protein', optionId: 'paneer', portionSizeId: 'large' },
      { groupId: 'rice', optionId: 'brown', portionSizeId: null },
    ];
    expect(messages(priceOrderLines([line(1, [1, noSize])], menu))).toEqual([
      'lines.0.combinations.0.choices.0: Paneer doesn’t come in sizes here.',
      'lines.0.combinations.0.choices.1: Pick a size for Brown rice.',
      'lines.0.combinations.0.choices: “Choose your protein” needs a choice.',
      'lines.0.combinations.0.choices: “Choose your rice” needs a choice.',
    ]);
  });

  it('refuses options that aren’t on this employee’s menu, and dishes that aren’t', () => {
    const chicken = [
      { groupId: 'protein', optionId: 'chicken', portionSizeId: null },
      paneerBrown[1]!,
    ];
    const result = priceOrderLines(
      [
        line(1, [1, chicken]),
        { dishId: 'biryani', quantity: 1, combinations: [{ quantity: 1, choices: [] }] },
      ],
      menu,
    );
    expect(messages(result)).toEqual([
      'lines.0.combinations.0.choices.0: That option isn’t available in “Choose your protein” for this employee.',
      'lines.0.combinations.0.choices: “Choose your protein” needs a choice.',
      'lines.1.dishId: This dish isn’t on this employee’s menu.',
    ]);
  });

  it('two combinations with the same choices are one combination', () => {
    const reordered = [...paneerBrown].reverse();
    expect(signatureOf(reordered)).toBe(signatureOf(paneerBrown));
    expect(messages(priceOrderLines([line(3, [1, paneerBrown], [2, reordered])], menu))).toEqual([
      'lines.0.combinations.1: Same choices as another combination - add to its quantity instead.',
    ]);
  });

  it('one line per dish, and the dish’s minimum order quantity', () => {
    const dosa = (quantity: number) => ({
      dishId: 'dosa',
      quantity,
      combinations: [{ quantity, choices: [] }],
    });
    expect(messages(priceOrderLines([dosa(1)], menu))).toEqual([
      'lines.0.quantity: Order at least 2.',
    ]);
    expect(messages(priceOrderLines([dosa(2), dosa(3)], menu))).toEqual([
      'lines.1.dishId: This dish is already on the order - split it into combinations on that line instead.',
    ]);
  });
});

describe('price locking', () => {
  it('an edited placed order keeps the placed price for unchanged combinations only', () => {
    const lockedPaneer: LockedCombination = {
      unitPriceCents: 650, // prices have gone up since it was placed
      options: [],
    };
    const locked = new Map([['bowl', new Map([[signatureOf(paneerBrown), lockedPaneer]])]]);
    const [priced] = priceOrderLines(
      [line(5, [3, paneerBrown], [2, tofuJeeraLarge])],
      menu,
      locked,
    ).lines;
    expect(priced?.combinations.map((c) => [c.unitPriceCents, c.lockedPrice])).toEqual([
      [650, true], // kept
      [660, false], // new: today's price
    ]);
    expect(priced?.lineTotalCents).toBe(650 * 3 + 660 * 2);
  });
});

describe('orderActionProblem', () => {
  const context = (changes: Partial<OrderActionContext>): OrderActionContext => ({
    status: 'PLACED',
    locked: false,
    canWrite: true,
    canOverride: false,
    outForDelivery: false,
    ...changes,
  });

  it('before the cut-off, staff edit and cancel drafts and placed orders', () => {
    expect(orderActionProblem('EDIT', context({}))).toBeNull();
    expect(orderActionProblem('CANCEL', context({ status: 'DRAFT' }))).toBeNull();
    expect(orderActionProblem('PLACE', context({ status: 'DRAFT' }))).toBeNull();
    expect(orderActionProblem('PLACE', context({}))).toBe('Only drafts can be placed.');
  });

  it('after the cut-off, only an admin (override) can', () => {
    expect(orderActionProblem('EDIT', context({ locked: true }))).toMatch(/only an admin/);
    expect(orderActionProblem('CANCEL', context({ locked: true }))).toMatch(/only an admin/);
    expect(orderActionProblem('EDIT', context({ locked: true, canOverride: true }))).toBeNull();
  });

  it('confirmed orders: no edits; an admin may cancel, reject or change delivery until it leaves', () => {
    const confirmed = context({ status: 'CONFIRMED', locked: true });
    expect(orderActionProblem('EDIT', { ...confirmed, canOverride: true })).toMatch(
      /can’t be edited/,
    );
    expect(orderActionProblem('CANCEL', confirmed)).toMatch(/Only an admin/);
    expect(orderActionProblem('CANCEL', { ...confirmed, canOverride: true })).toBeNull();
    expect(orderActionProblem('CHANGE_DELIVERY', { ...confirmed, canOverride: true })).toBeNull();
    expect(
      orderActionProblem('REJECT', { ...confirmed, canOverride: true, outForDelivery: true }),
    ).toBe('The order is already out for delivery.');
  });

  it('finished orders can’t change', () => {
    for (const status of ['DELIVERED', 'CANCELLED', 'REJECTED'] as const) {
      expect(orderActionProblem('EDIT', context({ status, canOverride: true }))).not.toBeNull();
      expect(orderActionProblem('CANCEL', context({ status, canOverride: true }))).not.toBeNull();
    }
  });
});

describe('plannedTimes (spec 4.7)', () => {
  it('works back from the delivery time: lead minutes, then 30 minutes for the kitchen', () => {
    const times = plannedTimes('2026-10-07', 750, 60, 'Asia/Kolkata');
    // 12:30 IST = 07:00 UTC
    expect(times.deliveryAt.toISOString()).toBe('2026-10-07T07:00:00.000Z');
    expect(times.plannedDispatchReadyAt.toISOString()).toBe('2026-10-07T06:00:00.000Z');
    expect(times.plannedKitchenReadyAt.toISOString()).toBe('2026-10-07T05:30:00.000Z');
  });
});
