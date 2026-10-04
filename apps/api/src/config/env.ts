import { IANAZone } from 'luxon';
import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at startup.
 * A missing or bad value stops the app immediately with a clear message,
 * instead of failing later in the middle of a request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, { message: 'must be a postgresql:// connection string' }),
  /** Signs the session token. Long and random; different in every environment. */
  JWT_SECRET: z.string().min(32, { message: 'must be at least 32 characters long' }),
  /** How long a sign-in lasts. 12 h covers a kitchen shift. */
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  /**
   * "true" keeps realistic demo orders flowing (see src/demo): history for the last two
   * weeks, today's kitchen and deliveries moving with the clock, the next days' orders.
   */
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  KITCHEN_TIME_ZONE: z
    .string()
    .default('Asia/Kolkata')
    .refine((zone) => IANAZone.isValidZone(zone), {
      message: 'must be an IANA time zone such as Asia/Kolkata',
    }),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
