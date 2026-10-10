# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app

# Node 22 ships npm 10, which cannot read this lock file — the same split ci.yml makes:
# Node matches production, npm matches the lock.
RUN npm install --global npm@11

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Inlined into the browser bundle by `next build`, so these are build inputs, not runtime
# config — Vault never sees them. A DSN is public by design (instrumentation-client.ts).
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
# The commit SHA, which Sentry cannot find here: `.git` is not in the build context. Used
# for the source-map upload and the browser bundle; the runner sets it again below.
ARG SENTRY_RELEASE
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    SENTRY_RELEASE=$SENTRY_RELEASE

# The source-map upload token is a BuildKit secret, never an ARG: build args are recorded in
# the image history. Absent, `withSentryConfig` skips the upload and the build still passes.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    npm run build

# The migration runner, bundled to one file so the Argo CD PreSync Job can run it from this
# image. The standalone output carries only what the server imports, which is neither
# `db/migrate.ts` nor `tsx`. `ws`'s two optional native speedups stay external: it loads
# them in a `try` and falls back without them.
RUN npx --no -- esbuild db/migrate.ts \
    --bundle --platform=node --format=esm --target=node22 \
    --external:bufferutil --external:utf-8-validate \
    --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
    --outfile=dist/migrate.mjs

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# The server SDK reads the release at run time, so it matches the source maps uploaded above.
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

RUN groupadd --system --gid 1001 nextjs \
  && useradd --system --uid 1001 --gid nextjs nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

# `node dist/migrate.mjs` — `db/migrate.ts` resolves `../drizzle` from its own directory, so
# the bundle one level down finds the SQL at /app/drizzle.
COPY --from=builder --chown=nextjs:nextjs /app/dist/migrate.mjs ./dist/migrate.mjs
COPY --from=builder --chown=nextjs:nextjs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
