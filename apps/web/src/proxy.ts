import { SESSION_COOKIE_NAME } from '@fernleaf/shared';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sends people who aren't signed in to /login before an app page even renders.
 *
 * This only checks that a session cookie exists - it's a convenience, not security.
 * Every API call is checked by the server, and an expired cookie is caught there (401),
 * after which the app sends the person back here to sign in.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== '/') loginUrl.searchParams.set('next', next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except the API, the sign-in page, Next.js internals and files (anything with a dot).
  matcher: ['/((?!api/|login|_next/|.*\\..*).*)'],
};
