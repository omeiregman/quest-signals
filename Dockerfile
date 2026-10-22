# syntax=docker/dockerfile:1
# Quest — single image: builds the web SPA, runs the Hono API + poller which also
# serves the built web app. Self-hosted; runs the TS server via tsx.

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Bake pnpm into the image so cold starts never need to download it (offline-safe).
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

# ---- build: install all deps + build the web SPA -----------------------------
FROM base AS build
# Toolchain so a better-sqlite3 node-gyp fallback can compile if no prebuilt binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @quest/web build

# ---- runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_URL=/app/data/quest.sqlite \
    WEB_DIST=/app/apps/web/dist
# Copy the installed workspace (node_modules incl. the native better-sqlite3 build,
# source, drizzle migrations, and the built web/dist) from the build stage.
COPY --from=build /app /app
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["pnpm", "--filter", "@quest/server", "start"]
