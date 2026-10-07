# team1 Ecosystem Hub

`hub.team1.network` — the home for builders in the team1 / Avalanche ecosystem: hackathons & workshops, builder signup and community, public bounties, education (courses, workshops), builder projects (reused to apply for grants and hackathons), an evaluation/scoring backend and a university program. Large parts of `~/git/builders-hub` (notably hackathons) will move here.

**Status:** base only. Auth, permissions, audit log, jobs, `/api/v1`, design system and deployment exist; feature **areas** are added on top, each with its own spec in `docs/superpowers/specs/`. Base design: `docs/superpowers/specs/2026-10-07-ecosystem-hub-base-design.md`.

Several developers work here in parallel, mostly each on one area. The structure below exists so an area's PR touches its own folders — keep it that way.

## Stack
- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui (new-york, `src/components/ui`) · lucide-react
- Prisma 7 + `@prisma/adapter-pg` + PostgreSQL · Zod 4 · pg-boss 12 (background jobs)
- Auth: **Better Auth** — Google, GitHub, email OTP (nodemailer SMTP). Accounts with the same email link automatically only when the provider reports it verified — never add `trustedProviders` (it links unverified emails). Member-portal SSO comes later via the `genericOAuth` plugin.
- vitest · pnpm · Node 24 (`.node-version`). Deploy: **Railway**, two services from one Docker image (web + worker).

## Commands — always `pnpm` (never npm/yarn)
- `docker compose up -d` — local Postgres on **port 5433** (`.env.example` matches)
- `pnpm dev` — dev server on :3000 · `pnpm worker` — pg-boss worker (watch mode) · `pnpm dev:all` — both
- `pnpm db:migrate --name <change>` — create + apply a migration · `pnpm db:studio` · `pnpm db:reset`
- `pnpm typecheck` · `pnpm lint` · `pnpm test` (vitest, `tests/*.test.ts`, DB-less) · `pnpm build` · `pnpm build:worker`
- Verify every change with `pnpm typecheck && pnpm lint && pnpm test`; extend the matching test file when touching pure libs.
- Local sign-in without SMTP: request an email code, it is printed in the `pnpm dev` console. Put your email in `SUPER_ADMIN_EMAILS` to get admin.

## Code structure — route-first areas
There is no "module" layer. An **area** (hackathons, bounties, education, …) lives next to its routes in Next.js **private folders** (`_name` = never routed):

```
src/app/(site)/<area>/                 public pages of the area
  page.tsx, [id]/page.tsx
  _components/                         the area's UI
  _lib/permissions.ts                  the area's permission keys
  _lib/actions.ts                      server actions ('use server') — writes
  _lib/queries.ts                      reads for Server Components
  _lib/schemas.ts                      zod schemas
  _lib/jobs/                           background jobs (optional)
  _lib/nav.ts                          admin nav entries (optional)
src/app/admin/<area>/                  admin pages; import logic from @/app/(site)/<area>/_lib/…
src/app/(app)/…                        signed-in builder pages (dashboard, …)
prisma/schema/<area>.prisma            the area's models (multi-file schema)
```
- **Shared core** — `src/lib/*` (auth, session, permissions, guards, action, audit, db, mailer, api-keys, jobs) and `src/components/{ui,layout}`. Areas import from the core; the core never imports from an area except through the three registries below.
- **Reads** = Server Components calling `queries.ts`. **Writes** = Server Actions in `actions.ts`, always wrapped in `action()`. `src/app/api/` is only for Better Auth (`api/auth`), `api/health`, the external `api/v1` and future webhooks — don't add internal JSON endpoints for the UI.
- Never import another area's internals (`_components`, `_lib/queries`, …). If two areas need the same thing, move it to the core in its own PR.

### Adding an area — checklist
1. Routes + private folders as above. Admin pages under `src/app/admin/<area>/`.
2. Models in `prisma/schema/<area>.prisma` (`@@map` snake_case table names), then `pnpm db:migrate --name <area>-init`.
3. Permission keys in `src/app/(site)/<area>/_lib/permissions.ts`, spread into `PERMISSIONS` in `src/lib/permissions.ts` (one line). See "Authorization".
4. Admin nav entries in `_lib/nav.ts`, spread into `ADMIN_NAV` in `src/app/admin/_lib/nav.ts` (one line). Each entry's `show` must mirror its page guard.
5. Jobs (if any) in `_lib/jobs/`, added to `JOBS` in `src/lib/jobs/index.ts` (one line).
6. Public pages into `src/app/sitemap.ts`.
7. A `CODEOWNERS` block for the area's folders.
8. Tests for the area's pure rules in `tests/<area>*.test.ts`.

## Security rules (non-negotiable)
- **Every server action goes through `action({ schema, permission }, handler)`** (`src/lib/action.ts`). Server actions are public POST endpoints — a page guard does not protect the action. `permission` is a registry key, `'superAdmin'`, or `'user'` (any signed-in user). Throw `ActionError('message')` for user-facing errors; anything else is logged and masked.
- **Every admin page/layout calls a guard** (`src/lib/guards.ts`): `requireUser()`, `requirePermission(p)`, `requireSuperAdmin()`. Unauthenticated → `/sign-in?next=…`; lacking power → 404 (never reveal admin surfaces).
- `src/proxy.ts` (Next 16's renamed middleware) only does the CSP nonce and a coarse cookie-presence wall for `/dashboard` and `/admin`. It is **not** authorization.
- **Write an audit entry for every state-changing action**: `recordAudit({ actorId, action: 'thing.verb', entityType, entityId, before, after })` (`src/lib/audit.ts`) — diffs before/after, never throws. Never put secrets (API keys, hashes, tokens) in it.
- Validate all input with Zod (inside `action()` / at the route). Never log secrets or PII.
- `/api/v1/*` routes start with `requireApiKey(req, scope)` (`src/lib/api-keys.ts`) and answer via `v1Json` / `v1Error` (`{ success, data | error }`, no-store, no CORS). They take hashed identifiers (sha256 of lower(trim(email))), never plain emails. Keys are hashed, scoped by `API_SCOPES` (`src/lib/api-scopes.ts`, only ever add) and managed by super admins at `/admin/api-keys`.
- Post-sign-in redirects go through `safeNext()` (`src/lib/safe-next.ts`) — no open redirects.
- New inline scripts must carry the CSP nonce (`(await headers()).get('x-nonce')`), like `ThemeProvider` and the Plausible script in `src/app/layout.tsx`.

## Authorization model — single source of truth: `src/lib/permissions.ts`
- **Permissions are global string keys** (`hackathons.manage`, `users.view`, …) in the typed `PERMISSIONS` registry: `{ group, label, sensitive?, requires? }`. Keys are persisted — **only ever add, never rename or remove** without a data migration. Unknown keys found in the DB are ignored (never granted).
- A user's effective permissions = ⋃ permissions of their **roles** (`Role` / `UserRole`) ∪ their **direct grants** (`UserPermission`). Roles are defined by super admins at `/admin/access`.
- **Super admin** = `User.isSuperAdmin` **or** a *verified* email in `SUPER_ADMIN_EMAILS` (bootstrap / break-glass; `isSuperAdminUser` in `src/lib/access.ts`). Super admins hold every permission. Only super admins manage roles, grants, other super admins, the audit log, jobs and API keys — those are deliberately **not** grantable permissions (`'superAdmin'` in `action()`, `requireSuperAdmin()` on pages). A super admin can't remove their own flag.
- Roles and grants are read **live from the DB on every request** in `getCurrentUser()` (`src/lib/session.ts`, React-`cache`d per request) — never cached in the session/cookie, so a revoke is immediate. Run checks against that user; don't re-query roles.
- Checks (pure, isomorphic): `can(user, p)`, `holdsAny(user)` (the `/admin` gate), `isPermission(key)`.
- **Per-object power is not a permission.** "Judge of hackathon X", "admin of university Y", "reviewer of this bounty" are data on that object (e.g. a `HackathonJudge` table) plus a pure predicate in the area's `_lib` — e.g. `canJudge(user, hackathon) = can(user, 'hackathons.manage') || isAssignedJudge(user, hackathon)`. There is deliberately no scoped-permission system.
- **Adding a permission:** pick a key `<area>.<verb>` (reuse one if it's the same power), add it to the area's `permissions.ts` with a clear `label` (+ `sensitive` if it exposes personal data), guard pages with `requirePermission`, actions with `action({ permission })`, gate nav/buttons with `can()`. Registry integrity is tested in `tests/permissions.test.ts`.

## Database
- One Postgres schema (`public`) on purpose. Organisation comes from the multi-file Prisma schema (`prisma/schema/*.prisma`, generator + datasource in `base.prisma`). Revisit per-domain Postgres schemas only with a concrete consumer (read-only analytics role, external service owning tables) — `ALTER TABLE … SET SCHEMA` keeps that cheap later.
- pg-boss owns its own `pgboss` schema (created by the worker at boot), invisible to Prisma.
- **Never `prisma db push`** — always `pnpm db:migrate`. The migration history is one linear sequence shared by everyone: if `main` gained a migration while your branch had one, rebase, delete your migration folder, and re-run `pnpm db:migrate --name …` so yours comes last.
- Railway applies migrations on every web deploy (`preDeployCommand` in `railway.toml`). Write migrations that are safe while the previous version is still serving (add columns nullable/with defaults; drop in a later release).
- Better Auth models (`prisma/schema/auth.prisma`) keep Better Auth's field names — don't rename them.

## Background jobs
- Registry in `src/lib/jobs/index.ts` (`JOBS`, `Job { name, cron (UTC), run(data?) → summary }`). Executed by the pg-boss worker (`src/worker.ts`, plain Node — never runs inside Next), a second Railway service from the same image (`railway.worker.toml`, `node /worker/worker.mjs`).
- Every execution is a `JobRun` row (`running/success/partial/failed`, summary JSON; a non-empty `summary.failed` array = partial). `executeJob` never throws.
- "Run now" at `/admin/jobs` (super admin) enqueues via `enqueueJob` (`src/lib/jobs/boss.ts`, send-only client). Job names are queue names — never rename.
- `esbuild` bundles the worker with `pg-boss`, `prisma`, `@prisma/*` external; a new runtime dependency of a job is bundled automatically unless it has native parts.

## Design
- Brand source of truth: `~/git/team1/common/brand/brand_guide.md` (skill: `team1-frontend-design`). Tokens live in `src/app/globals.css`.
- **Dark is the default** (canvas `#0B0A0F`, surfaces `surface-1` / `surface-2`). Ava Red (`brand-*`, `#E6212F`) is brand-only — errors use `destructive` (`#dc2626`), never red brand.
- Grey text/borders come from the semantic tokens `text-fg-heading / fg-body / fg-muted / fg-faint` and `border-line` — they switch theme via `light-dark()`, no `dark:` needed. Don't write raw `zinc-*`/`gray-*`.
- Font: Kanit (300 body / 500 headings). Radius: cards `rounded-xl` (12px), controls `rounded-lg` (8px). Cards hover: `hover:-translate-y-0.5 hover:border-brand hover:shadow-glow`. Touch targets ≥ 44px. `:focus-visible` ring and `prefers-reduced-motion` are global — don't remove.
- Copy: always "team1" lowercase ("Team1" only at the start of a sentence, never "TEAM1" — also not via `uppercase`).
- Logos/favicons are copied from `~/git/team1/common/brand/assets/` — never redrawn. Use `<Logo />`.
- Reuse before building: `src/components/ui/*` (shadcn), `src/components/layout/*` (`PageHeader`, `SearchForm`, `Pager`, `Logo`, `SiteHeader`, `SiteFooter`). Add shadcn components with `pnpm dlx shadcn@latest add <name>` (then fix the `cn` import to `@/lib/utils` if the CLI writes `from "cn"`).

## Conventions
- Dates are stored as UTC (`DateTime` = timestamptz semantics) and shown with an explicit zone; admin tables print UTC.
- Server action results are `{ ok: true, data } | { ok: false, error }` — show `error` with `toast.error`.
- Privacy policy: one policy for all team1 sites, linked as `https://go.team1.network/privacy-policy` (source in the team1-network repo). A feature that collects, shows, shares or tracks new personal data needs a policy update there.
- Analytics: self-hosted Plausible (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`), no cookies, no banner.
- Do not run git commands or commit unless explicitly asked.

## Integrations (planned)
- **Member portal** (`~/git/team1/member.team1.network`): `POST /api/v1/members/check` (scope `members:check`, body `{ emailHash }`) answers "is this a team1 member" — the intended way to give members extra features. Later also SSO via `genericOAuth`.
- **Cascade** and others call this hub's `/api/v1` with keys from `/admin/api-keys`.

# Basic Behaviour

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
