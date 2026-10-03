import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/**
 * App-wide HTTP settings, shared by main.ts and the e2e tests so tests run the app
 * exactly as production does.
 */
export function configureApp(app: NestExpressApplication): void {
  // Every route lives under /api. The web app forwards /api/* to this server.
  app.setGlobalPrefix('api');
  // Render (and Vercel's proxy) sit in front of us. Trust their X-Forwarded-* headers
  // so secure cookies and client IPs work correctly.
  app.set('trust proxy', 1);
  app.use(helmet());
  // Delivery photos arrive as base64 JSON (shrunk in the browser first), so allow ~2 MB bodies.
  app.useBodyParser('json', { limit: '2mb' });
  // Reads the session cookie into request.cookies.
  app.use(cookieParser());
  app.enableShutdownHooks();
}
