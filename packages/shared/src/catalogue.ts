import { z } from 'zod';

// ---------------------------------------------------------------------------
// Reference lists (spec 4.1): admin-managed, deactivated rather than deleted
// ---------------------------------------------------------------------------

export const REFERENCE_KINDS = [
  'allergens',
  'dietary-tags',
  'kitchen-stations',
  'portion-sizes',
  'packaging-types',
] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const REFERENCE_KIND_INFO: Record<
  ReferenceKind,
  { title: string; singular: string; description: string }
> = {
  allergens: {
    title: 'Allergens',
    singular: 'allergen',
    description: 'Declared on dishes and options; recorded for employees.',
  },
  'dietary-tags': {
    title: 'Dietary tags',
    singular: 'dietary tag',
    description: 'Vegan, Jain, gluten-free… on dishes, options and employee preferences.',
  },
  'kitchen-stations': {
    title: 'Kitchen stations',
    singular: 'station',
    description: 'Where a dish is cooked. Prep units are routed to their dish’s station.',
  },
  'portion-sizes': {
    title: 'Portion sizes',
    singular: 'portion size',
    description: 'Sizes an option can be sold in, each with its own surcharge.',
  },
  'packaging-types': {
    title: 'Packaging types',
    singular: 'packaging type',
    description: 'How meals are packed; each company has a default.',
  },
};

export const referenceKindSchema = z.enum(REFERENCE_KINDS);

const referenceName = z
  .string()
  .trim()
  .min(1, { message: 'Enter a name.' })
  .max(60, { message: 'Keep it under 60 characters.' });

export const createReferenceItemSchema = z.object({ name: referenceName });

export const updateReferenceItemSchema = z
  .object({
    name: referenceName.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change.' });

export type CreateReferenceItemInput = z.infer<typeof createReferenceItemSchema>;
export type UpdateReferenceItemInput = z.infer<typeof updateReferenceItemSchema>;

export interface ReferenceItemDto {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export type ReferenceDataDto = Record<ReferenceKind, ReferenceItemDto[]>;

// ---------------------------------------------------------------------------
// Dishes, options and option groups
// ---------------------------------------------------------------------------

const cents = z
  .number({ message: 'Enter an amount.' })
  .int({ message: 'Use whole cents.' })
  .min(0, { message: 'Can’t be negative.' })
  .max(10_000_000, { message: 'That’s too much.' });

const ids = z.array(z.string().min(1)).default([]);

function unique<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

export const TEMPERATURES = ['HOT', 'COLD'] as const;
export type Temperature = (typeof TEMPERATURES)[number];

/** Body of POST /api/dishes and PUT /api/dishes/:id */
export const dishInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, { message: 'Use 2–20 letters, digits or dashes.' }),
  name: z.string().trim().min(1, { message: 'Enter a name.' }).max(80),
  description: z.string().trim().max(500).default(''),
  imageUrl: z
    .union([z.literal(''), z.url({ message: 'Enter a full image URL (https://…).' })])
    .nullable()
    .transform((value) => value || null),
  temperature: z.enum(TEMPERATURES),
  costCents: cents,
  kitchenStationId: z.string().min(1).nullable(),
  minOrderQuantity: z
    .number({ message: 'Enter a quantity.' })
    .int()
    .min(1, { message: 'Use 1 or more, or leave empty.' })
    .max(1000)
    .nullable(),
  allergenIds: ids,
  dietaryTagIds: ids,
  isActive: z.boolean().default(true),
});

export type DishInput = z.infer<typeof dishInputSchema>;

export const optionGroupInputSchema = z
  .object({
    /** Present when editing an existing group; absent for a new one. */
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1, { message: 'Name the group.' }).max(60),
    isRequired: z.boolean(),
    maxSelections: z.number({ message: 'Enter a number.' }).int().min(1).max(20),
    usesPortions: z.boolean(),
    portionSizeIds: ids,
    optionIds: z.array(z.string().min(1)).min(1, { message: 'Add at least one option.' }),
  })
  .refine((group) => !group.usesPortions || group.portionSizeIds.length > 0, {
    path: ['portionSizeIds'],
    message: 'Pick the sizes this group sells.',
  })
  .refine((group) => group.usesPortions || group.portionSizeIds.length === 0, {
    path: ['portionSizeIds'],
    message: 'Only portioned groups have sizes.',
  })
  .refine((group) => group.maxSelections <= group.optionIds.length, {
    path: ['maxSelections'],
    message: 'Can’t allow more picks than there are options.',
  })
  .refine((group) => unique(group.optionIds), {
    path: ['optionIds'],
    message: 'Each option can only be listed once.',
  });

/** Body of PUT /api/dishes/:id/option-groups - the full ordered list of the dish's groups. */
export const dishOptionGroupsSchema = z
  .object({ groups: z.array(optionGroupInputSchema).max(10) })
  .refine((value) => unique(value.groups.map((g) => g.name.toLowerCase())), {
    path: ['groups'],
    message: 'Two groups have the same name.',
  });

export type OptionGroupInput = z.infer<typeof optionGroupInputSchema>;
export type DishOptionGroupsInput = z.infer<typeof dishOptionGroupsSchema>;

/** Body of POST /api/options and PUT /api/options/:id */
export const optionInputSchema = z.object({
  name: z.string().trim().min(1, { message: 'Enter a name.' }).max(60),
  description: z.string().trim().max(300).default(''),
  costCents: cents,
  allergenIds: ids,
  dietaryTagIds: ids,
  /** Sizes this option is sold in, each with an extra charge on top of the option's price. */
  portions: z
    .array(z.object({ portionSizeId: z.string().min(1), extraChargeCents: cents }))
    .default([])
    .refine((portions) => unique(portions.map((p) => p.portionSizeId)), {
      message: 'Each size can only be listed once.',
    }),
  isActive: z.boolean().default(true),
});

export type OptionInput = z.infer<typeof optionInputSchema>;

export const dishListQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
});

interface NamedRef {
  id: string;
  name: string;
}

export interface DishSummaryDto {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  temperature: Temperature;
  kitchenStation: NamedRef | null;
  /** Null for roles without pricing access. */
  costCents: number | null;
  optionGroupCount: number;
  isActive: boolean;
}

export interface OptionGroupDto {
  id: string;
  name: string;
  isRequired: boolean;
  maxSelections: number;
  usesPortions: boolean;
  portionSizes: NamedRef[];
  options: (NamedRef & { isActive: boolean })[];
}

export interface DishDetailDto extends DishSummaryDto {
  description: string;
  minOrderQuantity: number | null;
  allergenIds: string[];
  dietaryTagIds: string[];
  optionGroups: OptionGroupDto[];
  updatedAt: string;
}

export interface OptionDto {
  id: string;
  name: string;
  description: string;
  /** Null for roles without pricing access. */
  costCents: number | null;
  allergenIds: string[];
  dietaryTagIds: string[];
  portions: { portionSizeId: string; portionSizeName: string; extraChargeCents: number }[];
  /** How many option groups offer it. */
  usedInGroups: number;
  isActive: boolean;
}
