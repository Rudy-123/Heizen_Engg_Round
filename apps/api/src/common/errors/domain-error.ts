import { ErrorCode, type FieldError } from '@fernleaf/shared';

/**
 * Base class for every error we throw on purpose. It carries the HTTP status, a stable code
 * and optional per-field messages. AllExceptionsFilter turns it into the shared ApiErrorBody.
 */
export class DomainError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: FieldError[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 - the request doesn't have the right shape (missing field, wrong type, ...). */
export class ValidationFailedError extends DomainError {
  constructor(fieldErrors: FieldError[], message = 'Some fields are invalid.') {
    super(400, ErrorCode.ValidationFailed, message, fieldErrors);
  }
}

/** 404 - the thing asked for doesn't exist (or the caller isn't allowed to know it exists). */
export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(404, ErrorCode.NotFound, `${what} was not found.`);
  }
}

/** 409 - the action clashes with the current state (already started, changed by someone else, ...). */
export class ConflictError extends DomainError {
  constructor(message: string, code: string = ErrorCode.Conflict) {
    super(409, code, message);
  }
}

/** 422 - the request is well-formed but breaks a business rule (cut-off passed, quantities don't add up, ...). */
export class BusinessRuleError extends DomainError {
  constructor(code: string, message: string, fieldErrors?: FieldError[]) {
    super(422, code, message, fieldErrors);
  }
}
