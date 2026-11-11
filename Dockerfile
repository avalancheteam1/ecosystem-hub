FROM node:24-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# Install the exact pnpm version pinned in package.json's "packageManager".
COPY package.json /tmp/pkg.json
RUN npm i -g pnpm@"$(node -p "require('/tmp/pkg.json').packageManager.split('@').pop()")" && rm /tmp/pkg.json

# No BuildKit cache mounts on purpose - Railway needs literal per-service cache
# ids, which can't work in a Dockerfile shared by the web + worker services.

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts: skips postinstall (prisma generate runs in the build stage).
RUN pnpm i --frozen-lockfile --ignore-scripts

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are inlined into the client bundle at build time. Railway passes
# service variables as --build-arg; they reach RUN steps only when declared here.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ENV NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN
# next.config.ts derives the next/image upload host from it; the config is baked at build.
ARG STORAGE_PUBLIC_BASE_URL
ENV STORAGE_PUBLIC_BASE_URL=$STORAGE_PUBLIC_BASE_URL
# Version skew: a tab from an older deploy hard-reloads on its next navigation
# instead of calling server actions that no longer exist. Empty = disabled.
ARG RAILWAY_GIT_COMMIT_SHA
ENV NEXT_DEPLOYMENT_ID=$RAILWAY_GIT_COMMIT_SHA
# Fixed key (Railway variable, never rotate casually): server action IDs are salted
# with it, so unchanged actions keep their ID across deploys. Empty = new key per build.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
RUN pnpm prisma generate
RUN pnpm run build:worker
# Exact lockfile-resolved versions of the worker's runtime deps (no drift).
RUN node -p "['pg-boss','prisma','@prisma/client','@prisma/adapter-pg'].map(n => n + '@' + JSON.parse(require('fs').readFileSync('node_modules/' + n + '/package.json')).version).join(' ')" > /app/worker-deps.txt
# GlitchTip: browser DSN (inlined) and source-map upload. Build args reach every later RUN as env, so they
# are declared last (only the Next build sees the auth token) and in the build stage only (it never reaches
# the runner image). No token = no upload. Railway has no documented secret mounts, hence ARG.
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_URL
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN
RUN pnpm run build
# Browser source maps never reach the runner, even when the upload failed or was skipped.
# Both copies: .next/static and the one copy:standalone made (the runner copies from both).
RUN find .next/static .next/standalone/.next/static -name '*.map' -delete

# /worker: the worker's runtime deps + the prisma CLI and migrations, which the
# web service's preDeployCommand uses for `prisma migrate deploy`. Cached as
# long as the resolved versions and schema are unchanged.
FROM base AS worker-deps
WORKDIR /worker
COPY prisma/ prisma/
COPY prisma.config.ts ./
# the 4 top-level versions are exact, their transitive deps resolve fresh -
# the workspace file at least applies minimumReleaseAge + overrides to them. A full
# `pnpm i --frozen-lockfile --prod` would be exact but adds every app dep (~250 MB).
COPY pnpm-workspace.yaml ./
COPY --from=build /app/worker-deps.txt ./
RUN pnpm init && pnpm add --allow-build=@prisma/engines --allow-build=prisma $(cat worker-deps.txt) && pnpm prisma generate

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Owned by node: the server writes its prerender cache under .next/server at runtime.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Background worker (pg-boss): same image, second Railway service, start command
# `node /worker/worker.mjs` (railway.worker.toml).
COPY --from=worker-deps /worker /worker
COPY --from=build /app/dist/worker/worker.mjs /worker/worker.mjs

RUN mkdir -p .next/cache && chown node:node .next/cache
USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
