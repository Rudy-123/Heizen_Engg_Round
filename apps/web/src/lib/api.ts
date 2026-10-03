import type { ApiErrorBody, FieldError } from '@fernleaf/shared';

/**
 * An error response from the API, in the shared ApiErrorBody shape.
 * `fieldErrors` use the same dot paths as our form field names, so forms can show
 * each message next to the right field (see applyServerErrors).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Calls our API. Requests go to /api/* on this same site and Next.js forwards them to the
 * NestJS server, so the browser sends the session cookie automatically.
 */
async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      "Can't reach the server. Check your connection and try again.",
    );
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return data as T;

  const error = isErrorBody(data) ? data : null;
  if (!error && response.status >= 502 && response.status <= 504) {
    throw new ApiError(
      response.status,
      'SERVER_UNAVAILABLE',
      'The server is starting up or unavailable. Please try again in a moment.',
    );
  }
  throw new ApiError(
    response.status,
    error?.code ?? 'HTTP_ERROR',
    error?.message ?? `Request failed (${response.status}).`,
    error?.fieldErrors ?? [],
  );
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorBody).code === 'string' &&
    typeof (value as ApiErrorBody).message === 'string'
  );
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
