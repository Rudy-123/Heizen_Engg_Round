import type { MenuDishDto, OrderChoiceInput, OrderLineInput } from '@fernleaf/shared';

/**
 * Pure choices for the demo simulation: who orders what, and when each step happens.
 * Everything is driven by a random generator seeded from a stable string (a date, an order
 * id), so running the simulation again makes the same choices - nothing flickers or doubles.
 */

export type Random = () => number;

/** A small, fast, seeded generator (mulberry32 over an FNV-1a hash of the seed). */
export function randomFor(seed: string): Random {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A whole number from `min` to `max`, both included. */
export function between(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('Nothing to pick from');
  return item;
}

const NOTES = [
  'No onions, please.',
  'Extra green chutney.',
  'Less spicy, please.',
  'Please add cutlery.',
  'Call on arrival - I am in a meeting till 1.',
];

/**
 * One employee's order: one or two dishes from their own menu, usually one meal each (these
 * are individual boxed meals), with valid choices for every option group. Dishes with the
 * employee's allergens are avoided - people don't order what makes them ill - except now and
 * then, so the kitchen's allergy warnings have something to show.
 */
export function planLines(
  random: Random,
  menu: MenuDishDto[],
  allergenIds: Set<string>,
): OrderLineInput[] {
  const safe = menu.filter(
    (dish) =>
      (dish.minOrderQuantity ?? 1) <= 3 &&
      (random() < 0.05 || !dish.allergens.some((a) => allergenIds.has(a.id))),
  );
  if (safe.length === 0) return [];
  const first = pick(random, safe);
  const dishes = [first];
  if (random() < 0.25) {
    const second = pick(random, safe);
    if (second.dishId !== first.dishId) dishes.push(second);
  }
  return dishes.map((dish) => {
    const wanted = random() < 0.75 ? 1 : random() < 0.75 ? 2 : 3;
    const quantity = Math.max(wanted, dish.minOrderQuantity ?? 1);
    const one = choicesFor(random, dish);
    // Now and then a line splits into two different combinations (spec 4.1: "6 + 4").
    if (quantity >= 2 && dish.optionGroups.length > 0 && random() < 0.4) {
      const other = choicesFor(random, dish);
      if (signature(other) !== signature(one)) {
        const split = between(random, 1, quantity - 1);
        return {
          dishId: dish.dishId,
          quantity,
          combinations: [
            { quantity: split, choices: one },
            { quantity: quantity - split, choices: other },
          ],
        };
      }
    }
    return { dishId: dish.dishId, quantity, combinations: [{ quantity, choices: one }] };
  });
}

/** Every required group answered; optional groups sometimes; add-on groups up to their limit. */
export function choicesFor(random: Random, dish: MenuDishDto): OrderChoiceInput[] {
  const choices: OrderChoiceInput[] = [];
  for (const group of dish.optionGroups) {
    if (group.options.length === 0) continue;
    if (!group.isRequired && random() >= 0.35) continue;
    const count = Math.min(
      group.maxSelections,
      group.options.length,
      group.maxSelections > 1 && random() < 0.4 ? 2 : 1,
    );
    const options = [...group.options].sort(() => random() - 0.5).slice(0, count);
    for (const option of options) {
      choices.push({
        groupId: group.id,
        optionId: option.id,
        portionSizeId:
          group.usesPortions && option.sizes.length > 0
            ? pick(random, option.sizes).portionSizeId
            : null,
      });
    }
  }
  return choices;
}

function signature(choices: OrderChoiceInput[]): string {
  return choices
    .map((c) => `${c.groupId}:${c.optionId}:${c.portionSizeId ?? ''}`)
    .sort()
    .join('|');
}

/** A note on about one order in ten. */
export function planNote(random: Random): string {
  return random() < 0.1 ? pick(random, NOTES) : '';
}

/** What happens to an order before the kitchen sees it. */
export type OrderFate = 'PLACED' | 'DRAFT' | 'CANCELLED';

export function planFate(random: Random, cutoffStillAhead: boolean): OrderFate {
  const roll = random();
  // Before the cut-off more orders are still drafts: that's what "chase the drafts" is for.
  if (roll < (cutoffStillAhead ? 0.12 : 0.04)) return 'DRAFT';
  if (roll < (cutoffStillAhead ? 0.16 : 0.09)) return 'CANCELLED';
  return 'PLACED';
}

const MINUTE = 60_000;

/**
 * When the kitchen finishes an order: most a little before the planned kitchen-ready time,
 * about one in ten late - so the boards and dashboards have real exceptions to show.
 */
export function planKitchenReady(random: Random, plannedKitchenReadyAt: Date): Date {
  const late = random() < 0.1;
  const minutes = late ? between(random, 5, 25) : -between(random, 3, 25);
  return new Date(plannedKitchenReadyAt.getTime() + minutes * MINUTE);
}

/** A unit's start and finish around the order's ready time. */
export function planUnit(random: Random, readyAt: Date): { startAt: Date; doneAt: Date } {
  const doneAt = new Date(readyAt.getTime() - between(random, 0, 8) * MINUTE);
  const startAt = new Date(doneAt.getTime() - between(random, 15, 45) * MINUTE);
  return { startAt, doneAt };
}

/**
 * A drop's day after the kitchen: packed a few minutes after its last order is ready, out
 * around its planned dispatch time, delivered around the agreed time - most on time, some
 * not (on-time figures should be honest, not 100%).
 */
export function planDrop(
  random: Random,
  times: { kitchenReadyAt: Date; plannedDispatchReadyAt: Date; deliveryAt: Date },
): { readyAt: Date; outAt: Date; deliveredAt: Date } {
  const readyAt = new Date(times.kitchenReadyAt.getTime() + between(random, 3, 10) * MINUTE);
  const outAt = new Date(
    Math.max(
      readyAt.getTime() + 4 * MINUTE,
      times.plannedDispatchReadyAt.getTime() + between(random, -8, 6) * MINUTE,
    ),
  );
  const offset = random() < 0.85 ? between(random, -12, 8) : between(random, 12, 35);
  const deliveredAt = new Date(
    Math.max(outAt.getTime() + 15 * MINUTE, times.deliveryAt.getTime() + offset * MINUTE),
  );
  return { readyAt, outAt, deliveredAt };
}

const DELIVERY_NOTES = ['Handed to reception.', 'Left at the pantry.', 'Signed for by security.'];

export function planDeliveryNote(random: Random): string {
  return random() < 0.3 ? pick(random, DELIVERY_NOTES) : '';
}
