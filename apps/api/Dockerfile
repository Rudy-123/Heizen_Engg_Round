# NestJS API image. Build from the repo root (the API needs the shared package):
#   docker build -f apps/api/Dockerfile -t fernleaf-api .

FROM node:22-bookworm-slim AS base
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
# The Prisma CLI (generate, migrate deploy) looks for OpenSSL. The runtime image doesn't run it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Install every workspace's dependencies from the lockfile. Only package files are copied
# first, so this layer is reused until a dependency changes.
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Shared package -> Prisma client -> API. This stage also has the Prisma CLI and tsx,
# so docker-compose.yml uses it for migrations and the seed (the db-setup service).
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @fernleaf/shared \
  && npm run db:generate -w @fernleaf/api \
  && npm run build -w @fernleaf/api

# Production dependencies of the API only, without the build tools.
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @fernleaf/api

FROM node:22-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production PORT=4000
COPY --from=prod-deps /repo/node_modules node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
