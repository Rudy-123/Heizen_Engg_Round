import type { FieldError, MenuDishDto } from '@fernleaf/shared';

/**
 * Order lines and their combinations (spec 4.1) as pure functions: validation and pricing.
 *
 *   one line per dish; line quantity >= the dish's minimum order quantity
 *   the combinations' quantities add up exactly to the line quantity
 *   each combination: every choice is one of the dish's options on this employee's menu,
 *     every required group is answered, no group has more than its maximum,
 *     portioned groups say which size, and no two combinations are the same
 *   unit price = dish price + the chosen options' prices (+ size surcharges)
 *   combination total = unit x quantity;  line total = sum of combinations;  order = sum of lines
 *
 * Prices lock when an order is placed: when a placed order is edited, a combination that
 * already existed (same signature) keeps the unit price it was placed at.
 */

export interface ChoiceRequest {
  groupId: string;
  optionId: string;
  portionSizeId: string | null;
}

export interface CombinationRequest {
  quantity: number;
  choices: ChoiceRequest[];
}

export interface LineRequest {
  dishId: string;
  quantity: number;
  combinations: CombinationRequest[];
}

/** A dish as this employee can order it: menu and prices from the menu resolver, plus costs. */
export interface OrderableDish {
  dish: MenuDishDto;
  sku: string;
  costCents: number;
  /** Option id -> what it costs the kitchen. */
  optionCosts: ReadonlyMap<string, number>;
}

export interface PricedOption {
  optionId: string;
  optionGroupId: string;
  portionSizeId: string | null;
  optionName: string;
  groupName: string;
  portionName: string | null;
  /** Option price + size surcharge, per meal. */
  priceCents: number;
  costCents: number;
}

export interface PricedCombination {
  quantity: number;
  signature: string;
  unitPriceCents: number;
  totalCents: number;
  options: PricedOption[];
  /** Kept the price it was placed at. */
  lockedPrice: boolean;
}

export interface PricedLine {
  dishId: string;
  dishName: string;
  dishSku: string;
  quantity: number;
  dishUnitPriceCents: number;
  dishUnitCostCents: number;
  lineTotalCents: number;
  combinations: PricedCombination[];
}

/** A combination's price as placed: kept when the order is edited. */
export interface LockedCombination {
  unitPriceCents: number;
  options: PricedOption[];
}

/** dish id -> signature -> locked price. */
export type LockedPrices = ReadonlyMap<string, ReadonlyMap<string, LockedCombination>>;

/** The same choices always give the same signature, whatever order they were picked in. */
export function signatureOf(choices: ChoiceRequest[]): string {
  return choices
    .map((choice) => `${choice.groupId}:${choice.optionId}:${choice.portionSizeId ?? '-'}`)
    .sort()
    .join(',');
}

/** Validates and prices every line. Problems use form paths like "lines.0.combinations.1.choices". */
export function priceOrderLines(
  requests: LineRequest[],
  menu: ReadonlyMap<string, OrderableDish>,
  locked: LockedPrices = new Map(),
): { lines: PricedLine[]; totalCents: number; problems: FieldError[] } {
  const problems: FieldError[] = [];
  const lines: PricedLine[] = [];
  const seenDishes = new Set<string>();

  requests.forEach((request, index) => {
    const path = `lines.${index}`;
    if (seenDishes.has(request.dishId)) {
      problems.push({
        path: `${path}.dishId`,
        message:
          'This dish is already on the order - split it into combinations on that line instead.',
      });
      return;
    }
    seenDishes.add(request.dishId);
    const result = priceLine(request, menu.get(request.dishId), locked.get(request.dishId), path);
    problems.push(...result.problems);
    if (result.line) lines.push(result.line);
  });

  const totalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return { lines, totalCents, problems };
}

function priceLine(
  request: LineRequest,
  orderable: OrderableDish | undefined,
  locked: ReadonlyMap<string, LockedCombination> | undefined,
  path: string,
): { line: PricedLine | null; problems: FieldError[] } {
  if (!orderable) {
    return {
      line: null,
      problems: [{ path: `${path}.dishId`, message: 'This dish isn’t on this employee’s menu.' }],
    };
  }
  const { dish } = orderable;
  const problems: FieldError[] = [];

  if (dish.minOrderQuantity !== null && request.quantity < dish.minOrderQuantity) {
    problems.push({
      path: `${path}.quantity`,
      message: `Order at least ${dish.minOrderQuantity}.`,
    });
  }
  const assigned = request.combinations.reduce((sum, c) => sum + c.quantity, 0);
  if (assigned !== request.quantity) {
    problems.push({
      path: `${path}.combinations`,
      message: `The combinations add up to ${assigned}, but the line is for ${request.quantity}.`,
    });
  }

  const groups = new Map(dish.optionGroups.map((group) => [group.id, group]));
  const signatures = new Set<string>();
  const combinations: PricedCombination[] = [];

  request.combinations.forEach((combination, index) => {
    const cpath = `${path}.combinations.${index}`;
    const counts = new Map<string, number>();
    const options: PricedOption[] = [];

    combination.choices.forEach((choice, choiceIndex) => {
      const choicePath = `${cpath}.choices.${choiceIndex}`;
      const group = groups.get(choice.groupId);
      if (!group) {
        problems.push({ path: choicePath, message: 'That isn’t one of this dish’s choices.' });
        return;
      }
      const option = group.options.find((candidate) => candidate.id === choice.optionId);
      if (!option) {
        problems.push({
          path: choicePath,
          message: `That option isn’t available in “${group.name}” for this employee.`,
        });
        return;
      }
      if (
        options.some((picked) => picked.optionId === option.id && picked.optionGroupId === group.id)
      ) {
        problems.push({ path: choicePath, message: `${option.name} is picked twice.` });
        return;
      }
      let surcharge = 0;
      let portionName: string | null = null;
      if (group.usesPortions) {
        const size = option.sizes.find((s) => s.portionSizeId === choice.portionSizeId);
        if (!size) {
          problems.push({ path: choicePath, message: `Pick a size for ${option.name}.` });
          return;
        }
        surcharge = size.extraChargeCents;
        portionName = size.name;
      } else if (choice.portionSizeId !== null) {
        problems.push({ path: choicePath, message: `${option.name} doesn’t come in sizes here.` });
        return;
      }
      counts.set(group.id, (counts.get(group.id) ?? 0) + 1);
      options.push({
        optionId: option.id,
        optionGroupId: group.id,
        portionSizeId: group.usesPortions ? choice.portionSizeId : null,
        optionName: option.name,
        groupName: group.name,
        portionName,
        priceCents: option.priceCents + surcharge,
        costCents: orderable.optionCosts.get(option.id) ?? 0,
      });
    });

    for (const group of dish.optionGroups) {
      const count = counts.get(group.id) ?? 0;
      if (group.isRequired && count === 0) {
        problems.push({ path: `${cpath}.choices`, message: `“${group.name}” needs a choice.` });
      }
      if (count > group.maxSelections) {
        problems.push({
          path: `${cpath}.choices`,
          message: `“${group.name}” allows at most ${group.maxSelections}.`,
        });
      }
    }

    const signature = signatureOf(combination.choices);
    if (signatures.has(signature)) {
      problems.push({
        path: cpath,
        message: 'Same choices as another combination - add to its quantity instead.',
      });
    }
    signatures.add(signature);

    const lock = locked?.get(signature);
    const unitPriceCents = lock
      ? lock.unitPriceCents
      : dish.priceCents + options.reduce((sum, option) => sum + option.priceCents, 0);
    combinations.push({
      quantity: combination.quantity,
      signature,
      unitPriceCents,
      totalCents: unitPriceCents * combination.quantity,
      options: lock ? lock.options : options,
      lockedPrice: lock !== undefined,
    });
  });

  if (problems.length > 0) return { line: null, problems };
  return {
    line: {
      dishId: dish.dishId,
      dishName: dish.name,
      dishSku: orderable.sku,
      quantity: request.quantity,
      dishUnitPriceCents: dish.priceCents,
      dishUnitCostCents: orderable.costCents,
      lineTotalCents: combinations.reduce((sum, c) => sum + c.totalCents, 0),
      combinations,
    },
    problems,
  };
}
