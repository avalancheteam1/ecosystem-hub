FROM node:24-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# Install the exact pnpm version pinned in package.json's "packageManager".
COPY package.json /tmp/pkg.json
RUN npm i -g pnpm@"$(node -p "require('/tmp/pkg.json').packageManager.split('@').pop()")" && rm /tmp/pkg.json

# No BuildKit cache mounts on purpose — Railway needs literal per-service cache
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
RUN pnpm prisma generate
RUN pnpm run build
RUN pnpm run build:worker
# Exact lockfile-resolved versions of the worker's runtime deps (no drift).
RUN node -p "['pg-boss','prisma','@prisma/client','@prisma/adapter-pg'].map(n => n + '@' + JSON.parse(require('fs').readFileSync('node_modules/' + n + '/package.json')).version).join(' ')" > /app/worker-deps.txt

# /worker: the worker's runtime deps + the prisma CLI and migrations, which the
# web service's preDeployCommand uses for `prisma migrate deploy`. Cached as
# long as the resolved versions and schema are unchanged.
FROM base AS worker-deps
WORKDIR /worker
COPY prisma/ prisma/
COPY prisma.config.ts ./
COPY --from=build /app/worker-deps.txt ./
RUN pnpm init && pnpm add --allow-build=@prisma/engines --allow-build=prisma $(cat worker-deps.txt) && pnpm prisma generate

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Background worker (pg-boss): same image, second Railway service, start command
# `node /worker/worker.mjs` (railway.worker.toml).
COPY --from=worker-deps /worker /worker
COPY --from=build /app/dist/worker/worker.mjs /worker/worker.mjs

RUN mkdir -p .next/cache && chown -R node:node .next/cache
USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
