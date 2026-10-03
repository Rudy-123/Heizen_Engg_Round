function prismaCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
}

/** True when Prisma refused a write because it would break a unique constraint (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return prismaCode(error) === 'P2002';
}

/** True when an update or delete targeted a row that doesn't exist (P2025). */
export function isRecordNotFound(error: unknown): boolean {
  return prismaCode(error) === 'P2025';
}
