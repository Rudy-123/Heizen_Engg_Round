/**
 * The one error shape every API error response uses.
 * The web app reads `fieldErrors` to show each message next to the right form field.
 */
export interface ApiErrorBody {
  statusCode: number;
  /** Stable machine-readable code, e.g. "VALIDATION_FAILED" or a business-rule code like "CUTOFF_PASSED". */
  code: string;
  /** Human-readable message that can be shown to staff as-is. */
  message: string;
  fieldErrors?: FieldError[];
}

export interface FieldError {
  /** Dot path to the field, e.g. "lines.1.combinations.0.quantity" (the same names react-hook-form uses). */
  path: string;
  message: string;
}

/** Generic error codes. Business rules add their own, more specific codes. */
export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  MalformedRequest: 'MALFORMED_REQUEST',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  BusinessRule: 'BUSINESS_RULE_VIOLATION',
  TooManyRequests: 'TOO_MANY_REQUESTS',
  Internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
