import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ValidationFailedError } from '../errors/domain-error.js';

/**
 * Validates a request body, query or param against a zod schema. The schemas live in
 * @fernleaf/shared, so the web forms check exactly the same rules - but this server-side
 * check is the one that counts.
 *
 * On failure it throws ValidationFailedError with one entry per bad field, using dot paths
 * ("lines.0.quantity") that the web app maps straight onto its form fields.
 *
 * Usage: `@Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput`
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new ValidationFailedError(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
}
