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
