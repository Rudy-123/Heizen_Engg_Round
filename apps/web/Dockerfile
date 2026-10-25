# Next.js web image. Build from the repo root (the site needs the shared package):
#   docker build -f apps/web/Dockerfile --build-arg API_ORIGIN=http://api:4000 -t fernleaf-web .

FROM node:22-bookworm-slim AS base
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# The /api/* rewrite is fixed when the site is built, so the API's address is a build
# argument, not a runtime setting. NEXT_STANDALONE makes next.config.ts emit a
# self-contained server with only the files it needs.
FROM deps AS build
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN NEXT_STANDALONE=true
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @fernleaf/shared && npm run build -w @fernleaf/web

FROM node:22-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build /repo/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
