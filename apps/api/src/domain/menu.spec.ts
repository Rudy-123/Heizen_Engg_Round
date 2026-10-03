import { deliveryTimeProblem } from './delivery-slots.js';
import {
  resolveMenu,
  type MenuCategoryInput,
  type MenuContext,
  type MenuDishInput,
  type MenuGroupInput,
  type MenuOptionInput,
} from './menu.js';
import type { TierRule } from './pricing.js';

const DAIRY = { id: 'dairy', name: 'Dairy' };

function option(id: string, prices: Record<string, number>, extra: Partial<MenuOptionInput> = {}) {
  return {
    id,
    name: id,
    isActive: true,
    costCents: 50,
    explicitPrices: new Map(Object.entries(prices)),
    allergens: [],
    dietaryTags: [],
    portions: [],
    ...extra,
  } satisfies MenuOptionInput;
}

function group(id: string, options: MenuOptionInput[], extra: Partial<MenuGroupInput> = {}) {
  return {
    id,
    name: id,
    isRequired: true,
    maxSelections: 1,
    usesPortions: false,
    sizes: [],
    options,
    ...extra,
  } satisfies MenuGroupInput;
}

function dish(id: string, prices: Record<string, number>, extra: Partial<MenuDishInput> = {}) {
  return {
    id,
    name: id,
    description: '',
    imageUrl: null,
    temperature: 'HOT',
    minOrderQuantity: null,
    isActive: true,
    costCents: 100,
    explicitPrices: new Map(Object.entries(prices)),
    allergens: [],
    dietaryTags: [],
    groups: [],
    ...extra,
  } satisfies MenuDishInput;
}

function category(
  id: string,
  dishes: MenuDishInput[],
  extra: Partial<MenuCategoryInput> = {},
): MenuCategoryInput {
  return {
    id,
    name: id,
    description: '',
    isActive: true,
    isSecret: false,
    items: dishes.map((d) => ({ id: `${id}/${d.id}`, isActive: true, dish: d })),
    ...extra,
  };
}

const context: MenuContext = {
  rules: new Map<string, TierRule>([['std', { basis: 'NONE' }]]),
  tierId: 'std',
  tierName: 'Standard',
  companyName: 'Acme',
  hiddenCategoryIds: new Set(),
  hiddenMenuItemIds: new Set(),
  allergies: new Map(),
};

const names = (menu: ReturnType<typeof resolveMenu>) =>
  menu.sections.map((s) => [s.name, s.dishes.map((d) => d.name)]);

describe('resolveMenu', () => {
  it('lists active categories and dishes in order, with their tier price', () => {
    const menu = resolveMenu(
      [
        category('Bowls', [dish('Paneer bowl', { std: 549 }), dish('Rajma', { std: 349 })]),
        category('Desserts', [dish('Gulab jamun', { std: 149 })]),
      ],
      context,
    );
    expect(names(menu)).toEqual([
      ['Bowls', ['Paneer bowl', 'Rajma']],
      ['Desserts', ['Gulab jamun']],
    ]);
    expect(menu.sections[0]?.dishes[0]?.priceCents).toBe(549);
    expect(menu.hidden).toEqual([]);
  });

  it('hides switched-off categories and categories hidden for the company, once each', () => {
    const menu = resolveMenu(
      [
        category('Bowls', [dish('a', { std: 1 })], { isActive: false }),
        category('Breakfast', [dish('b', { std: 1 })]),
      ],
      { ...context, hiddenCategoryIds: new Set(['Breakfast']) },
    );
    expect(menu.sections).toEqual([]);
    expect(menu.hidden).toEqual([
      expect.objectContaining({
        categoryName: 'Bowls',
        dishName: null,
        reason: 'CATEGORY_INACTIVE',
      }),
      expect.objectContaining({
        categoryName: 'Breakfast',
        dishName: null,
        reason: 'CATEGORY_HIDDEN_FOR_COMPANY',
        detail: 'The category is hidden for Acme.',
      }),
    ]);
  });

  it('gives each hidden dish its reason', () => {
    const bowls = category('Bowls', [
      dish('off-item', { std: 1 }),
      dish('hidden-item', { std: 1 }),
      dish('off-dish', { std: 1 }, { isActive: false }),
      dish('no-price', {}),
    ]);
    bowls.items[0]!.isActive = false;
    const menu = resolveMenu([bowls], {
      ...context,
      hiddenMenuItemIds: new Set(['Bowls/hidden-item']),
    });
    expect(menu.hidden.map((h) => [h.dishName, h.reason])).toEqual([
      ['off-item', 'ITEM_INACTIVE'],
      ['hidden-item', 'ITEM_HIDDEN_FOR_COMPANY'],
      ['off-dish', 'DISH_INACTIVE'],
      ['no-price', 'NO_PRICE'],
    ]);
    expect(menu.hidden[3]?.detail).toBe('No price on the Standard tier.');
    // Every dish was hidden, so the category isn't shown empty.
    expect(menu.sections).toEqual([]);
  });

  it('shows a dish with a typed $0 price; only a missing price hides it', () => {
    const menu = resolveMenu([category('Extras', [dish('Water', { std: 0 })])], context);
    expect(menu.sections[0]?.dishes[0]?.priceCents).toBe(0);
  });

  it('hides an item in one category only; the same dish elsewhere stays', () => {
    const rajma = dish('Rajma', { std: 349 });
    const menu = resolveMenu([category('Bowls', [rajma]), category('Favourites', [rajma])], {
      ...context,
      hiddenMenuItemIds: new Set(['Bowls/Rajma']),
    });
    expect(names(menu)).toEqual([['Favourites', ['Rajma']]]);
  });

  it('lists secret categories separately: reachable, not listed', () => {
    const menu = resolveMenu(
      [
        category('Bowls', [dish('a', { std: 1 })]),
        category('Chef specials', [dish('b', { std: 1 })], { isSecret: true }),
      ],
      context,
    );
    expect(menu.sections.map((s) => s.name)).toEqual(['Bowls']);
    expect(menu.secretSections.map((s) => s.name)).toEqual(['Chef specials']);
  });

  it('drops options that are switched off or have no price on the tier', () => {
    const bowl = dish(
      'Bowl',
      { std: 500 },
      {
        groups: [
          group('protein', [
            option('paneer', { std: 150 }),
            option('tofu', {}),
            option('chicken', { std: 200 }, { isActive: false }),
          ]),
        ],
      },
    );
    const [only] = resolveMenu([category('Bowls', [bowl])], context).sections[0]!.dishes;
    expect(only?.optionGroups[0]?.options.map((o) => [o.name, o.priceCents])).toEqual([
      ['paneer', 150],
    ]);
  });

  it('hides a dish whose required group has nothing left; drops an empty optional group', () => {
    const required = dish(
      'Needs protein',
      { std: 500 },
      {
        groups: [group('Choose your protein', [option('tofu', {})])],
      },
    );
    const optional = dish(
      'Plain rice',
      { std: 200 },
      {
        groups: [group('Add-ons', [option('raita', {})], { isRequired: false })],
      },
    );
    const menu = resolveMenu([category('Bowls', [required, optional])], context);
    expect(menu.hidden).toEqual([
      expect.objectContaining({
        dishName: 'Needs protein',
        reason: 'REQUIRED_GROUP_EMPTY',
        detail: '“Choose your protein” has no option available on the Standard tier.',
      }),
    ]);
    expect(menu.sections[0]?.dishes.map((d) => [d.name, d.optionGroups.length])).toEqual([
      ['Plain rice', 0],
    ]);
  });

  it('sells portioned options in the group’s sizes, with each size’s extra charge', () => {
    const regular = { id: 'reg', name: 'Regular' };
    const large = { id: 'lg', name: 'Large' };
    const rice = option(
      'jeera rice',
      { std: 0 },
      {
        portions: [
          { portionSizeId: 'lg', extraChargeCents: 40 },
          { portionSizeId: 'reg', extraChargeCents: 0 },
        ],
      },
    );
    const bowl = dish(
      'Bowl',
      { std: 500 },
      {
        groups: [group('Rice', [rice], { usesPortions: true, sizes: [regular, large] })],
      },
    );
    const menu = resolveMenu([category('Bowls', [bowl])], context);
    expect(menu.sections[0]?.dishes[0]?.optionGroups[0]?.options[0]?.sizes).toEqual([
      { portionSizeId: 'reg', name: 'Regular', extraChargeCents: 0 },
      { portionSizeId: 'lg', name: 'Large', extraChargeCents: 40 },
    ]);
  });

  it('flags the employee’s allergies without hiding the dish', () => {
    const menu = resolveMenu(
      [category('Bowls', [dish('Paneer bowl', { std: 549 }, { allergens: [DAIRY] })])],
      { ...context, allergies: new Map([['dairy', 'Dairy']]) },
    );
    expect(menu.sections[0]?.dishes[0]?.allergyWarnings).toEqual(['Dairy']);
  });

  it('prices on the company’s tier, including derived prices', () => {
    const menu = resolveMenu([category('Bowls', [dish('Bowl', { std: 1_090 })])], {
      ...context,
      rules: new Map<string, TierRule>([
        ['std', { basis: 'NONE' }],
        ['plus15', { basis: 'TIER', baseTierId: 'std', multiplierBps: 11_500 }],
      ]),
      tierId: 'plus15',
      tierName: 'Premium',
    });
    expect(menu.sections[0]?.dishes[0]?.priceCents).toBe(1_255);
  });
});

describe('deliveryTimeProblem', () => {
  const window = { startMinutes: 420, endMinutes: 1260, slotMinutes: 15 };

  it('accepts times on the grid inside the window, including both ends', () => {
    expect(deliveryTimeProblem(420, window)).toBeNull();
    expect(deliveryTimeProblem(750, window)).toBeNull();
    expect(deliveryTimeProblem(1260, window)).toBeNull();
  });

  it('refuses times outside the window or off the grid', () => {
    expect(deliveryTimeProblem(405, window)).toBe('Deliveries run 07:00–21:00.');
    expect(deliveryTimeProblem(1275, window)).toBe('Deliveries run 07:00–21:00.');
    expect(deliveryTimeProblem(752, window)).toBe(
      'Pick a time on the 15-minute grid (07:00–21:00).',
    );
  });
});
