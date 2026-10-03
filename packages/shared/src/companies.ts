import { z } from 'zod';
import { pageQuerySchema } from './pagination.js';
import {
  emailAddressSchema,
  emailDomainSchema,
  timeOfDaySchema,
  weekdaysSchema,
} from './settings.js';

/**
 * Companies (spec 4.4) and their employees (spec 4.5). Employees are customers: they never
 * sign in - staff create orders for them.
 */

/** Optional free text: empty becomes null. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { message: `Keep it under ${max} characters.` })
    .nullable()
    .default(null)
    .transform((value) => value || null);
}

const ids = z.array(z.string().min(1)).default([]);

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

/** A delivery address (body of POST/PUT /api/companies/:id/addresses). */
export const companyAddressInputSchema = z.object({
  label: z.string().trim().min(1, { message: 'Name this address, e.g. “Head office”.' }).max(60),
  line1: z.string().trim().min(1, { message: 'Enter the street address.' }).max(120),
  line2: optionalText(120),
  city: z.string().trim().min(1, { message: 'Enter the city.' }).max(60),
  postcode: z.string().trim().min(1, { message: 'Enter the postcode.' }).max(12),
  /** Where to go inside the building, gate codes... */
  instructions: z.string().trim().max(300).default(''),
  isActive: z.boolean().default(true),
});

export type CompanyAddressInput = z.infer<typeof companyAddressInputSchema>;

/** Everything about a company that is edited as one form (body of PUT /api/companies/:id). */
export const companyDetailsSchema = z.object({
  name: z.string().trim().min(1, { message: 'Enter the company name.' }).max(80),
  billingContactName: z
    .string()
    .trim()
    .min(1, { message: 'Enter who receives the invoices.' })
    .max(80),
  billingEmail: emailAddressSchema,
  billingPhone: optionalText(30),
  billingAddress: z.string().trim().min(1, { message: 'Enter the billing address.' }).max(300),
  /** Null = the default tier (spec 4.3 (4)). */
  priceTierId: z.string().min(1).nullable().default(null),
  /** Days the company can receive deliveries (spec 4.4: default Mon-Fri). */
  workingDays: weekdaysSchema.default([1, 2, 3, 4, 5]),
  defaultDeliveryTimeMinutes: timeOfDaySchema.default(750),
  /** How long before the delivery time the order must leave the kitchen (spec 4.4: default 60). */
  deliveryLeadMinutes: z
    .number({ message: 'Enter minutes.' })
    .int()
    .min(0, { message: 'Use 0 or more minutes.' })
    .max(600, { message: 'Use at most 600 minutes.' })
    .default(60),
  defaultPackagingTypeId: z.string().min(1).nullable().default(null),
  driverInstructions: z.string().trim().max(500).default(''),
  defaultDriverId: z.string().min(1).nullable().default(null),
  /** One of the company's own active employees (checked by the API). */
  ownerEmployeeId: z.string().min(1).nullable().default(null),
  isActive: z.boolean().default(true),
});

export type CompanyDetailsInput = z.infer<typeof companyDetailsSchema>;

/**
 * Body of POST /api/companies. A company has one or more email domains and delivery
 * addresses (spec 4.4), so it starts with one of each. The owner is chosen once the company
 * has employees.
 */
export const createCompanySchema = companyDetailsSchema.omit({ ownerEmployeeId: true }).extend({
  domain: emailDomainSchema,
  address: companyAddressInputSchema,
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const addCompanyDomainSchema = z.object({ domain: emailDomainSchema });

export const companyListQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
});

interface NamedRef {
  id: string;
  name: string;
}

export interface CompanySummaryDto {
  id: string;
  name: string;
  isActive: boolean;
  domains: string[];
  /** The tier assigned to the company; null means it uses the default tier. */
  priceTier: NamedRef | null;
  owner: NamedRef | null;
  employeeCount: number;
  addressCount: number;
  workingDays: number[];
}

export interface CompanyDomainDto {
  id: string;
  domain: string;
  /** Employees whose email is on this domain (a domain in use can't be removed). */
  employeeCount: number;
}

export interface CompanyAddressDto {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  instructions: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface CompanyHolidayDto {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
}

export interface CompanyDetailDto extends CompanyDetailsInput {
  id: string;
  domains: CompanyDomainDto[];
  addresses: CompanyAddressDto[];
  holidays: CompanyHolidayDto[];
  owner: (NamedRef & { email: string }) | null;
  /** The tier its employees are priced on: its own, or the default tier. */
  effectiveTier: (NamedRef & { isDefault: boolean }) | null;
  employeeCount: number;
  hiddenCategoryIds: string[];
  hiddenMenuItemIds: string[];
  updatedAt: string;
}

/** A staff member who can be picked as a company's default driver. */
export interface DriverOptionDto {
  id: string;
  name: string;
  phone: string | null;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

/** Body of POST /api/employees and PUT /api/employees/:id (a new companyId moves them). */
export const employeeInputSchema = z.object({
  companyId: z.string().min(1, { message: 'Pick the company.' }),
  firstName: z.string().trim().min(1, { message: 'Enter the first name.' }).max(60),
  lastName: z.string().trim().min(1, { message: 'Enter the last name.' }).max(60),
  email: emailAddressSchema,
  phone: optionalText(30),
  /** Permission flags set by staff (spec 4.5). */
  canChooseAddress: z.boolean().default(false),
  canChangeDeliveryTime: z.boolean().default(false),
  canChangePackaging: z.boolean().default(false),
  allergenIds: ids,
  dietaryTagIds: ids,
  isActive: z.boolean().default(true),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const employeeListQuerySchema = pageQuerySchema.extend({
  companyId: z.string().min(1).optional(),
  search: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

export interface EmployeeDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: NamedRef;
  canChooseAddress: boolean;
  canChangeDeliveryTime: boolean;
  canChangePackaging: boolean;
  allergenIds: string[];
  dietaryTagIds: string[];
  isActive: boolean;
  /** Is this employee their company's owner? */
  isOwner: boolean;
}
