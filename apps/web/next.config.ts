import path from 'node:path';
import type { NextConfig } from 'next';

// Every /api/* request from the browser is forwarded to the NestJS API. The browser only ever
// talks to this site's own domain, so the session cookie is first-party and no CORS is needed.
// All business logic lives in the API - this app has no server actions or API routes of its own.
const apiOrigin = process.env['API_ORIGIN'] ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Docker image (apps/web/Dockerfile) runs a self-contained server. Traced from the repo
  // root so the shared package is included. Vercel builds are unaffected.
  ...(process.env['NEXT_STANDALONE'] === 'true' && {
    output: 'standalone',
    outputFileTracingRoot: path.join(process.cwd(), '../..'),
  }),
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
