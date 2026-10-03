import { z } from 'zod';
import type { Temperature } from './catalogue.js';

/**
 * The menu (spec 4.2): dishes shown to employees through ordered categories. Categories and
 * items can be switched off, hidden from specific companies, and a category can be secret -
 * not listed, but still reachable.
 */

const ids = z.array(z.string().min(1)).default([]);

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

/** Body of POST /api/menu/categories and PUT /api/menu/categories/:id */
export const menuCategoryInputSchema = z.object({
  name: z.string().trim().min(1, { message: 'Name the category.' }).max(60),
  description: z.string().trim().max(200).default(''),
  isActive: z.boolean().default(true),
  /** Not listed on the menu, but still reachable. */
  isSecret: z.boolean().default(false),
});

export type MenuCategoryInput = z.infer<typeof menuCategoryInputSchema>;

/** A new order for categories, or for the items of one category: every id, once. */
export const reorderSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .max(500)
    .refine(unique, { message: 'Each entry can only appear once.' }),
});

export const addMenuItemSchema = z.object({
  dishId: z.string().min(1, { message: 'Pick a dish.' }),
});

export const updateMenuItemSchema = z.object({ isActive: z.boolean() });

/** Body of PUT /api/menu/hiding/:companyId - what this company's employees never see. */
export const companyMenuHidingSchema = z.object({
  hiddenCategoryIds: ids,
  hiddenMenuItemIds: ids,
});

export type CompanyMenuHidingInput = z.infer<typeof companyMenuHidingSchema>;

export const menuPreviewQuerySchema = z.object({
  employeeId: z.string().min(1, { message: 'Pick an employee.' }),
});

interface NamedRef {
  id: string;
  name: string;
}

export interface MenuItemDto {
  id: string;
  isActive: boolean;
  dish: { id: string; name: string; sku: string; imageUrl: string | null; isActive: boolean };
}

export interface MenuCategoryDto {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isSecret: boolean;
  items: MenuItemDto[];
}

// ---------------------------------------------------------------------------
// The menu as one employee sees it
// ---------------------------------------------------------------------------

/** Why a dish is not on an employee's menu. */
export type HiddenReason =
  | 'CATEGORY_INACTIVE'
  | 'CATEGORY_HIDDEN_FOR_COMPANY'
  | 'ITEM_INACTIVE'
  | 'ITEM_HIDDEN_FOR_COMPANY'
  | 'DISH_INACTIVE'
  | 'NO_PRICE'
  | 'REQUIRED_GROUP_EMPTY';

export interface MenuOptionDto {
  id: string;
  name: string;
  priceCents: number;
  allergens: NamedRef[];
  dietaryTags: NamedRef[];
  /** Portioned groups only: the sizes on sale, each with its extra charge. */
  sizes: { portionSizeId: string; name: string; extraChargeCents: number }[];
}

export interface MenuOptionGroupDto {
  id: string;
  name: string;
  isRequired: boolean;
  maxSelections: number;
  usesPortions: boolean;
  options: MenuOptionDto[];
}

export interface MenuDishDto {
  menuItemId: string;
  dishId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  temperature: Temperature;
  minOrderQuantity: number | null;
  priceCents: number;
  allergens: NamedRef[];
  dietaryTags: NamedRef[];
  /** The employee's allergies this dish contains (allergies flag dishes; they don't hide them). */
  allergyWarnings: string[];
  optionGroups: MenuOptionGroupDto[];
}

export interface MenuSectionDto {
  categoryId: string;
  name: string;
  description: string;
  dishes: MenuDishDto[];
}

export interface HiddenMenuEntryDto {
  categoryName: string;
  /** Null when the whole category is hidden. */
  dishName: string | null;
  reason: HiddenReason;
  /** Plain-English explanation, e.g. "No price on the Partner tier". */
  detail: string;
}

/** GET /api/menu/preview?employeeId= : exactly what this employee would see, and why not more. */
export interface MenuPreviewDto {
  employee: {
    id: string;
    name: string;
    email: string;
    allergies: NamedRef[];
    dietaryPreferences: NamedRef[];
  };
  company: NamedRef;
  tier: NamedRef & { isDefault: boolean; fromCompany: boolean };
  /** Listed categories, in order. */
  sections: MenuSectionDto[];
  /** Secret categories: not listed, but reachable (e.g. by a direct link). */
  secretSections: MenuSectionDto[];
  hidden: HiddenMenuEntryDto[];
}
