# team1 Ecosystem Hub

`hub.team1.network` — hackathons, workshops, bounties, education and projects for builders in the team1 / Avalanche ecosystem.

Contributor and agent guide: **[AGENTS.md](AGENTS.md)** (structure, permissions, conventions). Base design: `docs/superpowers/specs/2026-10-07-ecosystem-hub-base-design.md`.

## Local setup

Requires Node 24, pnpm and Docker.

```bash
cp .env.example .env            # set BETTER_AUTH_SECRET and your email in SUPER_ADMIN_EMAILS
docker compose up -d            # Postgres on localhost:5433
pnpm install
pnpm db:migrate                 # apply migrations
pnpm dev                        # http://localhost:3000
pnpm worker                     # background jobs (separate terminal) — or `pnpm dev:all`
```

Without SMTP settings, email sign-in codes are printed in the `pnpm dev` console.
Google/GitHub sign-in work once their client id/secret are set (callback URLs in `.env.example`).

Checks: `pnpm typecheck && pnpm lint && pnpm test`.

## Deployment (Railway)

One Docker image, two services in the same Railway project, plus a Railway Postgres:

| Service | Config file | Start | Notes |
|---|---|---|---|
| web | `railway.toml` | `node server.js` | runs `prisma migrate deploy` before each deploy; health check `/api/health`; domain `hub.team1.network` (via Cloudflare) |
| worker | `railway.worker.toml` (set as "Config-as-code file path") | `node /worker/worker.mjs` | pg-boss; no HTTP |

Both services need the env vars from `.env.example` (the worker only needs `DATABASE_URL`). `NEXT_PUBLIC_*` must also be available at build time (Railway passes service variables as build args).

The origin must only be reachable through Cloudflare (client IPs are taken from `cf-connecting-ip`) — don't expose a `*.up.railway.app` domain.

## Owners

Application owner and technical owner are tracked in the team1 project sheet.
