import { z } from 'zod';
import type { Dashboard, Permission } from './permissions.js';
import { emailAddressSchema } from './settings.js';

/**
 * Staff accounts (spec §3): people who sign in to the panel. Each has exactly one role, and a
 * role is just a named set of permissions. No emails are sent (out of scope), so an admin
 * sets the first password and passes it on.
 */

/** bcrypt only uses the first 72 bytes of a password, so longer ones are refused. */
const passwordSchema = z
  .string()
  .min(8, { message: 'Use at least 8 characters.' })
  .max(72, { message: 'Use at most 72 characters.' });

const staffFields = {
  name: z.string().trim().min(1, { message: 'Enter their name.' }).max(80),
  email: emailAddressSchema,
  phone: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .default(null)
    .transform((value) => value || null),
  roleId: z.string().min(1, { message: 'Pick a role.' }),
};

/** Body of POST /api/staff */
export const createStaffSchema = z.object({ ...staffFields, password: passwordSchema });

/** Body of PUT /api/staff/:id */
export const updateStaffSchema = z.object({ ...staffFields, isActive: z.boolean() });

/** Body of PUT /api/staff/:id/password */
export const resetPasswordSchema = z.object({ password: passwordSchema });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export interface StaffMemberDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: { id: string; key: string; name: string };
  isActive: boolean;
  /** One of the four reviewer accounts: email, role, password and status are locked. */
  isReviewerAccount: boolean;
}

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string;
  homeDashboard: Dashboard;
  permissions: Permission[];
  activeStaffCount: number;
}
