import type { SessionUser } from '@fernleaf/shared';

// AccessGuard puts the signed-in staff member on the request; this tells TypeScript about it.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
