import type { FieldError } from '@fernleaf/shared';
import { BusinessRuleError } from '../common/errors/domain-error.js';

/** Anything with a Prisma-style `count` - lets the check work inside or outside a transaction. */
interface Countable {
  count(args: { where: { id: { in: string[] } } }): Promise<number>;
}

/**
 * Checks that every id a request refers to (allergens, stations, options...) exists, and
 * reports the bad ones on the right form field instead of failing on a foreign key.
 */
export async function checkIdsExist(
  checks: { table: Countable; ids: string[]; path: string; label: string }[],
): Promise<void> {
  const problems: FieldError[] = [];
  for (const check of checks) {
    const wanted = [...new Set(check.ids)];
    if (wanted.length === 0) continue;
    const found = await check.table.count({ where: { id: { in: wanted } } });
    if (found !== wanted.length) {
      problems.push({
        path: check.path,
        message: `Some ${check.label} no longer exist. Reload and try again.`,
      });
    }
  }
  if (problems.length > 0) {
    throw new BusinessRuleError(
      'UNKNOWN_REFERENCE',
      'Some of the chosen items no longer exist.',
      problems,
    );
  }
}
