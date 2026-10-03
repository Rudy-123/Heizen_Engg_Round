import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/**
 * Shows a server validation error on the form: each field error goes next to its field,
 * anything else becomes a form-level message (form.formState.errors.root).
 * The server is the source of truth - this is how its answer reaches the person.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): void {
  if (error instanceof ApiError && error.fieldErrors.length > 0) {
    for (const fieldError of error.fieldErrors) {
      setError(fieldError.path as Path<T>, { type: 'server', message: fieldError.message });
    }
    return;
  }
  const message =
    error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  setError('root.server', { type: 'server', message });
}
