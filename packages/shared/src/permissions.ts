/**
 * Everything a staff member can be allowed to do.
 *
 * Access checks (on the server and in the UI) only ever test for these permissions -
 * never for role names - so adding a new role later means adding a Role row with a set
 * of permissions, not hunting through the code (spec §3).
 *
 * Must match the `Permission` enum in apps/api/prisma/schema.prisma; the API fails to
 * compile if the two lists drift apart.
 */
export const PERMISSIONS = [
  'STAFF_MANAGE',
  'SETTINGS_READ',
  'SETTINGS_WRITE',
  'CATALOGUE_READ',
  'CATALOGUE_WRITE',
  'MENU_READ',
  'MENU_WRITE',
  'PRICING_READ',
  'PRICING_WRITE',
  'COMPANIES_READ',
  'COMPANIES_WRITE',
  'EMPLOYEES_READ',
  'EMPLOYEES_WRITE',
  'ORDERS_READ',
  'ORDERS_WRITE',
  'ORDERS_OVERRIDE',
  'CUTOFF_RUN',
  'KITCHEN_READ',
  'KITCHEN_WORK',
  'KITCHEN_FORCE_COMPLETE',
  'DISPATCH_READ',
  'DISPATCH_MANAGE',
  'DELIVERIES_OWN',
  'DELIVERIES_ANY',
  'BILLING_READ',
  'BILLING_WRITE',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Plain-English meaning of each permission, shown on the roles page. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  STAFF_MANAGE: 'Create staff accounts, assign roles, deactivate staff',
  SETTINGS_READ: 'See platform settings (kitchen calendar, cut-off)',
  SETTINGS_WRITE: 'Change platform settings',
  CATALOGUE_READ: 'See dishes, options and reference lists',
  CATALOGUE_WRITE: 'Edit dishes, options and reference lists',
  MENU_READ: 'See menu categories and preview menus',
  MENU_WRITE: 'Edit menu categories, items and company hiding',
  PRICING_READ: 'See price tiers, prices and costs',
  PRICING_WRITE: 'Edit price tiers and prices',
  COMPANIES_READ: 'See companies',
  COMPANIES_WRITE: 'Edit companies',
  EMPLOYEES_READ: 'See employees',
  EMPLOYEES_WRITE: 'Edit and move employees',
  ORDERS_READ: 'See orders, including money',
  ORDERS_WRITE: 'Create, edit and cancel orders before the cut-off',
  ORDERS_OVERRIDE: 'Change or cancel orders after the cut-off',
  CUTOFF_RUN: 'Run cut-off processing manually',
  KITCHEN_READ: 'See the kitchen board',
  KITCHEN_WORK: 'Mark prep units started and done',
  KITCHEN_FORCE_COMPLETE: 'Force-complete a whole order in the kitchen',
  DISPATCH_READ: 'See the dispatch board',
  DISPATCH_MANAGE: 'Assign drivers and move drops through dispatch',
  DELIVERIES_OWN: 'See and deliver your own drops (makes you assignable as a driver)',
  DELIVERIES_ANY: "Deliver any drop on a driver's behalf",
  BILLING_READ: 'See invoices and uninvoiced orders',
  BILLING_WRITE: 'Create invoices, mark them paid, record credits',
};

/** Which dashboard a role lands on after signing in. */
export const DASHBOARDS = ['ADMIN', 'KITCHEN', 'DISPATCH', 'DRIVER'] as const;

export type Dashboard = (typeof DASHBOARDS)[number];
