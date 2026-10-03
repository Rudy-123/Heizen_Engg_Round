import { z } from 'zod';
import type { Dashboard, Permission } from './permissions.js';

/** Name of the httpOnly session cookie set by the API (the web app only checks it exists). */
export const SESSION_COOKIE_NAME = 'fernleaf_session';

/** Body of POST /api/auth/login. Emails are compared lower-case. */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Enter a valid email address.' })),
  password: z.string().min(1, { message: 'Enter your password.' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** The signed-in staff member, as returned by /api/auth/login and /api/auth/me. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: {
    key: string;
    name: string;
    homeDashboard: Dashboard;
  };
  /** Everything this person may do. The UI uses it to show/hide; the API enforces it. */
  permissions: Permission[];
}
