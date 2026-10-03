import type {
  HiddenMenuEntryDto,
  MenuDishDto,
  MenuOptionDto,
  MenuOptionGroupDto,
  MenuSectionDto,
  Temperature,
} from '@fernleaf/shared';
import { resolvePrice, type PricedItem, type TierRules } from './pricing.js';

/**
 * The menu as one employee sees it (spec 4.2 + 4.3), as a pure function. The menu preview
 * and the order form both use it, so staff see exactly what can be ordered.
 *
 *   for each category, in order:  skip it if switched off or hidden for the company
 *     for each dish in it:        hide it (with the reason) if the item is switched off or
 *                                 hidden for the company, the dish is switched off, it has
 *                                 no price on the tier, or a required group has no option left
 *     inside each option group:   keep only active options that have a price on the tier
 *   secret categories are returned separately: not listed, but reachable
 *   allergies never hide a dish - they are flagged
 */

interface NamedRef {
  id: string;
  name: string;
}

export interface MenuOptionInput extends PricedItem {
  id: string;
  name: string;
  isActive: boolean;
  allergens: NamedRef[];
  dietaryTags: NamedRef[];
  /** Sizes this option is sold in, with the extra charge for each. */
  portions: { portionSizeId: string; extraChargeCents: number }[];
}

export interface MenuGroupInput {
  id: string;
  name: string;
  isRequired: boolean;
  maxSelections: number;
  usesPortions: boolean;
  /** The group's sizes, in order (portioned groups only). */
  sizes: NamedRef[];
  options: MenuOptionInput[];
}

export interface MenuDishInput extends PricedItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  temperature: Temperature;
  minOrderQuantity: number | null;
  isActive: boolean;
  allergens: NamedRef[];
  dietaryTags: NamedRef[];
  groups: MenuGroupInput[];
}

export interface MenuCategoryInput {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isSecret: boolean;
  /** In display order. */
  items: { id: string; isActive: boolean; dish: MenuDishInput }[];
}

export interface MenuContext {
  rules: TierRules;
  tierId: string;
  tierName: string;
  companyName: string;
  hiddenCategoryIds: ReadonlySet<string>;
  hiddenMenuItemIds: ReadonlySet<string>;
  /** The employee's allergies: allergen id -> name. */
  allergies: ReadonlyMap<string, string>;
}

export interface ResolvedMenu {
  sections: MenuSectionDto[];
  secretSections: MenuSectionDto[];
  hidden: HiddenMenuEntryDto[];
}

/** `categories` must already be in display order. */
export function resolveMenu(categories: MenuCategoryInput[], context: MenuContext): ResolvedMenu {
  const menu: ResolvedMenu = { sections: [], secretSections: [], hidden: [] };

  for (const category of categories) {
    const hideCategory = (reason: HiddenMenuEntryDto['reason'], detail: string) =>
      menu.hidden.push({ categoryName: category.name, dishName: null, reason, detail });
    if (!category.isActive) {
      hideCategory('CATEGORY_INACTIVE', 'The category is switched off.');
      continue;
    }
    if (context.hiddenCategoryIds.has(category.id)) {
      hideCategory(
        'CATEGORY_HIDDEN_FOR_COMPANY',
        `The category is hidden for ${context.companyName}.`,
      );
      continue;
    }

    const dishes: MenuDishDto[] = [];
    for (const item of category.items) {
      const result = resolveItem(item, context);
      if ('reason' in result) {
        menu.hidden.push({ categoryName: category.name, dishName: item.dish.name, ...result });
      } else {
        dishes.push(result);
      }
    }
    // A category whose dishes are all hidden isn't shown empty; the reasons are in `hidden`.
    if (dishes.length === 0) continue;

    const section = {
      categoryId: category.id,
      name: category.name,
      description: category.description,
      dishes,
    };
    (category.isSecret ? menu.secretSections : menu.sections).push(section);
  }
  return menu;
}

type ItemResult = MenuDishDto | Pick<HiddenMenuEntryDto, 'reason' | 'detail'>;

function resolveItem(item: MenuCategoryInput['items'][number], context: MenuContext): ItemResult {
  const { dish } = item;
  if (!item.isActive) return { reason: 'ITEM_INACTIVE', detail: 'Switched off in this category.' };
  if (context.hiddenMenuItemIds.has(item.id)) {
    return {
      reason: 'ITEM_HIDDEN_FOR_COMPANY',
      detail: `Hidden for ${context.companyName} in this category.`,
    };
  }
  if (!dish.isActive) return { reason: 'DISH_INACTIVE', detail: 'The dish is switched off.' };

  // Spec 4.3 (5): no price on the tier -> not on the menu at all (never shown at $0).
  const price = resolvePrice(context.rules, context.tierId, dish).priceCents;
  if (price === null) {
    return { reason: 'NO_PRICE', detail: `No price on the ${context.tierName} tier.` };
  }

  const optionGroups: MenuOptionGroupDto[] = [];
  for (const group of dish.groups) {
    const options = availableOptions(group, context);
    if (options.length === 0) {
      // Every combination must answer every required group, so the dish can't be ordered.
      if (group.isRequired) {
        return {
          reason: 'REQUIRED_GROUP_EMPTY',
          detail: `“${group.name}” has no option available on the ${context.tierName} tier.`,
        };
      }
      continue; // an optional group with nothing on offer is simply left out
    }
    optionGroups.push({
      id: group.id,
      name: group.name,
      isRequired: group.isRequired,
      maxSelections: group.maxSelections,
      usesPortions: group.usesPortions,
      options,
    });
  }

  return {
    menuItemId: item.id,
    dishId: dish.id,
    name: dish.name,
    description: dish.description,
    imageUrl: dish.imageUrl,
    temperature: dish.temperature,
    minOrderQuantity: dish.minOrderQuantity,
    priceCents: price,
    allergens: dish.allergens,
    dietaryTags: dish.dietaryTags,
    allergyWarnings: dish.allergens
      .filter((allergen) => context.allergies.has(allergen.id))
      .map((allergen) => allergen.name),
    optionGroups,
  };
}

/** Active options with a price on the tier; in a portioned group, only those sold in all its sizes. */
function availableOptions(group: MenuGroupInput, context: MenuContext): MenuOptionDto[] {
  const options: MenuOptionDto[] = [];
  for (const option of group.options) {
    if (!option.isActive) continue;
    const price = resolvePrice(context.rules, context.tierId, option).priceCents;
    if (price === null) continue;

    const sizes = group.usesPortions
      ? group.sizes.flatMap((size) => {
          const portion = option.portions.find((p) => p.portionSizeId === size.id);
          return portion
            ? [
                {
                  portionSizeId: size.id,
                  name: size.name,
                  extraChargeCents: portion.extraChargeCents,
                },
              ]
            : [];
        })
      : [];
    // Saving a group already enforces this; the check keeps bad data off the menu.
    if (group.usesPortions && sizes.length !== group.sizes.length) continue;

    options.push({
      id: option.id,
      name: option.name,
      priceCents: price,
      allergens: option.allergens,
      dietaryTags: option.dietaryTags,
      sizes,
    });
  }
  return options;
}
