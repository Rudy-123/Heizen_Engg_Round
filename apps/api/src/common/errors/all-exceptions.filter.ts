import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@fernleaf/shared';
import type { Response } from 'express';
import { DomainError } from './domain-error.js';

/**
 * Turns every error into the same JSON shape (ApiErrorBody), so the web app handles errors one way.
 * Unexpected errors are logged with their stack and reported as a generic 500 - internals never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = toErrorBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : exception,
      );
    }
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }
}

export function toErrorBody(exception: unknown): ApiErrorBody {
  if (exception instanceof DomainError) {
    return {
      statusCode: exception.statusCode,
      code: exception.code,
      message: exception.message,
      ...(exception.fieldErrors?.length ? { fieldErrors: exception.fieldErrors } : {}),
    };
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    return { statusCode, code: codeForStatus(statusCode), message: messageOf(exception) };
  }

  // Express' JSON body parser reports a malformed body as an error with a `type` field.
  if (isBodyParseError(exception)) {
    return {
      statusCode: 400,
      code: ErrorCode.MalformedRequest,
      message: 'The request body is not valid JSON.',
    };
  }

  return {
    statusCode: 500,
    code: ErrorCode.Internal,
    message: 'Something went wrong on our side. Please try again.',
  };
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return ErrorCode.MalformedRequest;
    case 401:
      return ErrorCode.Unauthenticated;
    case 403:
      return ErrorCode.Forbidden;
    case 404:
      return ErrorCode.NotFound;
    case 409:
      return ErrorCode.Conflict;
    case 429:
      return ErrorCode.TooManyRequests;
    default:
      return status >= 500 ? ErrorCode.Internal : ErrorCode.MalformedRequest;
  }
}

/** Nest's built-in exceptions carry either a string or `{ message: string | string[] }`. */
function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : exception.message;
}

function isBodyParseError(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { type?: unknown }).type === 'entity.parse.failed'
  );
}
