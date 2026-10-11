# team1 Ecosystem Hub

`hub.team1.network` - the home for builders in the team1 / Avalanche ecosystem: hackathons & workshops, builder signup and community, public bounties, education (courses, workshops), builder projects (reused to apply for grants and hackathons), an evaluation/scoring backend and a university program. Large parts of `~/git/builders-hub` (notably hackathons) will move here.

**Status:** base (auth, permissions, audit, jobs, `/api/v1`, design, deployment) + areas **events**, **projects**, **hackathons** and **referrals**. Specs live in `docs/superpowers/specs/` - base: `2026-10-07-ecosystem-hub-base-design.md`, events & hackathons: `2026-10-08-hackathons-design.md`, referrals & groups: `2026-10-08-referrals-groups-design.md`.

Several developers work here in parallel, mostly each on one area. The structure below exists so an area's PR touches its own folders - keep it that way.

## Stack
- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui (new-york, `src/components/ui`) · lucide-react
- Prisma 7 + `@prisma/adapter-pg` + PostgreSQL · Zod 4 · pg-boss 12 (background jobs)
- Auth: **Better Auth** - Google, GitHub, email OTP (nodemailer SMTP). Accounts with the same email link automatically only when the provider reports it verified - never add `trustedProviders` (it links unverified emails). Member-portal SSO comes later via the `genericOAuth` plugin.
- vitest · pnpm · Node 24 (`.node-version`). Deploy: **Railway**, two services from one Docker image (web + worker).

## Commands - always `pnpm` (never npm/yarn)
- `docker compose up -d` - local Postgres on **port 5433** (`.env.example` matches)
- `pnpm dev` - dev server on :3000 · `pnpm worker` - pg-boss worker (watch mode) · `pnpm dev:all` - both
- `pnpm db:migrate --name <change>` - create + apply a migration · `pnpm db:studio` · `pnpm db:reset`
- `pnpm typecheck` · `pnpm lint` · `pnpm test` (vitest, `tests/*.test.ts`, DB-less) · `pnpm build` · `pnpm build:worker`
- Verify every change with `pnpm typecheck && pnpm lint && pnpm test`; extend the matching test file when touching pure libs.
- Local sign-in without SMTP: request an email code, it is printed in the `pnpm dev` console. Put your email in `SUPER_ADMIN_EMAILS` to get admin.

## Code structure - route-first areas
There is no "module" layer. An **area** (hackathons, bounties, education, …) lives next to its routes in Next.js **private folders** (`_name` = never routed):

```
src/app/(site)/<area>/                 public pages of the area
  page.tsx, [id]/page.tsx
  _components/                         the area's UI
  _lib/permissions.ts                  the area's permission keys
  _lib/actions.ts                      server actions ('use server') - writes
  _lib/queries.ts                      reads for Server Components
  _lib/schemas.ts                      zod schemas
  _lib/jobs/                           background jobs (optional)
  _lib/nav.ts                          admin nav entries (optional)
src/app/admin/<area>/                  admin pages; import logic from @/app/(site)/<area>/_lib/…
src/app/(app)/…                        signed-in builder pages (dashboard, …)
prisma/schema/<area>.prisma            the area's models (multi-file schema)
```
- **Shared core** - `src/lib/*` (auth, session, permissions, guards, action, audit, db, mailer, api-keys, jobs) and `src/components/{ui,layout}`. Areas import from the core; the core never imports from an area except through the three registries below.
- **Reads** = Server Components calling `queries.ts`. **Writes** = Server Actions in `actions.ts`, always wrapped in `action()`. `src/app/api/` is only for Better Auth (`api/auth`), `api/health`, the external `api/v1` and future webhooks - don't add internal JSON endpoints for the UI.
- Never import another area's internals (`_components`, `_lib/queries`, …). If two areas need the same thing, move it to the core in its own PR.

### Adding an area - checklist
1. Routes + private folders as above. Admin pages under `src/app/admin/<area>/`.
2. Models in `prisma/schema/<area>.prisma` (`@@map` snake_case table names), then `pnpm db:migrate --name <area>-init`.
3. Permission keys in `src/app/(site)/<area>/_lib/permissions.ts`, spread into `PERMISSIONS` in `src/lib/permissions.ts` (one line). See "Authorization".
4. Admin nav entries in `_lib/nav.ts`, spread into `ADMIN_NAV` in `src/app/admin/_lib/nav.ts` (one line). Each entry's `show` must mirror its page guard.
5. Jobs (if any) in `_lib/jobs/`, added to `JOBS` in `src/lib/jobs/index.ts` (one line).
6. Public pages into `src/app/sitemap.ts`.
7. A `CODEOWNERS` block for the area's folders.
8. Tests for the area's pure rules in `tests/<area>*.test.ts`.

## Security rules (non-negotiable)
- **A `'use server'` file may export ONLY `action(...)`-wrapped functions.** Every export of such a file becomes a public endpoint; a helper that trusts its arguments (e.g. `assertManage(id, user)`) must live in a plain server module (`import 'server-only'`).
- **Every server action goes through `action({ schema, permission }, handler)`** (`src/lib/action.ts`). Server actions are public POST endpoints - a page guard does not protect the action. `permission` is a registry key, `'superAdmin'`, or `'user'` (any signed-in user). Throw `ActionError('message')` for user-facing errors; anything else is logged and masked.
- **Every admin page/layout calls a guard** (`src/lib/guards.ts`): `requireUser()`, `requirePermission(p)`, `requireSuperAdmin()`. Unauthenticated → `/sign-in?next=…`; lacking power → 404 (never reveal admin surfaces).
- `src/proxy.ts` (Next 16's renamed middleware) only does the CSP nonce and a coarse cookie-presence wall for `/dashboard` and `/admin`. It is **not** authorization.
- **Write an audit entry for every state-changing action**: `recordAudit({ actorId, action: 'thing.verb', entityType, entityId, before, after })` (`src/lib/audit.ts`) - diffs before/after, never throws. Never put secrets (API keys, hashes, tokens) in it.
- Validate all input with Zod (inside `action()` / at the route). Never log secrets or PII.
- `/api/v1/*` routes start with `requireApiKey(req, scope)` (`src/lib/api-keys.ts`) and answer via `v1Json` / `v1Error` (`{ success, data | error }`, no-store, no CORS). They take hashed identifiers (sha256 of lower(trim(email))), never plain emails. Keys are hashed, scoped by `API_SCOPES` (`src/lib/api-scopes.ts`, only ever add) and managed by super admins at `/admin/api-keys`.
- Post-sign-in redirects go through `safeNext()` (`src/lib/safe-next.ts`) - no open redirects.
- New inline scripts must carry the CSP nonce (`(await headers()).get('x-nonce')`), like `ThemeProvider` and the Plausible script in `src/app/layout.tsx`.

## Authorization model - single source of truth: `src/lib/permissions.ts`
- **Permissions are global string keys** (`hackathons.manage`, `users.view`, …) in the typed `PERMISSIONS` registry: `{ group, label, sensitive?, requires? }`. Keys are persisted - **only ever add, never rename or remove** without a data migration. Unknown keys found in the DB are ignored (never granted).
- A user's effective permissions = ⋃ permissions of their **roles** (`Role` / `UserRole`) ∪ their **direct grants** (`UserPermission`). Roles are defined by super admins at `/admin/access`.
- **Super admin** = `User.isSuperAdmin` **or** a *verified* email in `SUPER_ADMIN_EMAILS` (bootstrap / break-glass; `isSuperAdminUser` in `src/lib/access.ts`). Super admins hold every permission. Only super admins manage roles, grants, other super admins, the audit log, jobs and API keys - those are deliberately **not** grantable permissions (`'superAdmin'` in `action()`, `requireSuperAdmin()` on pages). A super admin can't remove their own flag.
- Roles and grants are read **live from the DB on every request** in `getCurrentUser()` (`src/lib/session.ts`, React-`cache`d per request) - never cached in the session/cookie, so a revoke is immediate. Run checks against that user; don't re-query roles.
- Checks (pure, isomorphic): `can(user, p)`, `holdsAny(user)` (the `/admin` gate), `isPermission(key)`.
- **Per-object power is not a permission.** "Judge of hackathon X", "admin of university Y", "reviewer of this bounty" are data on that object (e.g. a `HackathonJudge` table) plus a pure predicate in the area's `_lib` - e.g. `canJudge(user, hackathon) = can(user, 'hackathons.manage') || isAssignedJudge(user, hackathon)`. There is deliberately no scoped-permission system.
- **Adding a permission:** pick a key `<area>.<verb>` (reuse one if it's the same power), add it to the area's `permissions.ts` with a clear `label` (+ `sensitive` if it exposes personal data), guard pages with `requirePermission`, actions with `action({ permission })`, gate nav/buttons with `can()`. Registry integrity is tested in `tests/permissions.test.ts`.

## Database
- One Postgres schema (`public`) on purpose. Organisation comes from the multi-file Prisma schema (`prisma/schema/*.prisma`, generator + datasource in `base.prisma`). Revisit per-domain Postgres schemas only with a concrete consumer (read-only analytics role, external service owning tables) - `ALTER TABLE … SET SCHEMA` keeps that cheap later.
- pg-boss owns its own `pgboss` schema (created by the worker at boot), invisible to Prisma.
- **Never `prisma db push`** - always `pnpm db:migrate`. The migration history is one linear sequence shared by everyone: if `main` gained a migration while your branch had one, rebase, delete your migration folder, and re-run `pnpm db:migrate --name …` so yours comes last.
- Railway applies migrations on every web deploy (`preDeployCommand` in `railway.toml`). Write migrations that are safe while the previous version is still serving (add columns nullable/with defaults; drop in a later release).
- Better Auth models (`prisma/schema/auth.prisma`) keep Better Auth's field names - don't rename them.

## Background jobs
- Registry in `src/lib/jobs/index.ts` (`JOBS`, `Job { name, cron (UTC), run(data?) → summary }`). Executed by the pg-boss worker (`src/worker.ts`, plain Node - never runs inside Next), a second Railway service from the same image (`railway.worker.toml`, `node /worker/worker.mjs`).
- Every execution is a `JobRun` row (`running/success/partial/failed`, summary JSON; a non-empty `summary.failed` array = partial). `executeJob` never throws.
- "Run now" at `/admin/jobs` (super admin) enqueues via `enqueueJob` (`src/lib/jobs/boss.ts`, send-only client). Job names are queue names - never rename.
- `esbuild` bundles the worker with `pg-boss`, `prisma`, `@prisma/*` external; a new runtime dependency of a job is bundled automatically unless it has native parts.

## Design
- Brand source of truth: `~/git/team1/common/brand/brand_guide.md` (skill: `team1-frontend-design`). Tokens live in `src/app/globals.css`.
- **Dark is the default** (canvas `#0B0A0F`, surfaces `surface-1` / `surface-2`). Ava Red (`brand-*`, `#E6212F`) is brand-only - errors use `destructive` (`#dc2626`), never red brand.
- Grey text/borders come from the semantic tokens `text-fg-heading / fg-body / fg-muted / fg-faint` and `border-line` - they switch theme via `light-dark()`, no `dark:` needed. Don't write raw `zinc-*`/`gray-*`.
- Font: Kanit (300 body / 500 headings). Radius: cards `rounded-xl` (12px), controls `rounded-lg` (8px). Cards hover: `hover:-translate-y-0.5 hover:border-brand hover:shadow-glow`. Touch targets ≥ 44px. `:focus-visible` ring and `prefers-reduced-motion` are global - don't remove.
- Copy: always "team1" lowercase ("Team1" only at the start of a sentence, never "TEAM1" - also not via `uppercase`).
- Logos/favicons are copied from `~/git/team1/common/brand/assets/` - never redrawn. Use `<Logo />`.
- **Reuse before building** - check these first, extend them rather than hand-rolling a variant:
  - Forms: `Field` (label + control + hint), `FormDialog` (dialog wrapping one form; closes only on success), `ConfirmButton` (destructive + confirm), `NativeSelect` (`ui/native-select`), `ChipToggle` (multi-select chips), `AnswerFields` / `AnswerList` (organiser-defined questions), hook `useActionToast()` (run an action → toast → refresh; resolves `true` on success).
  - Layout: `PageHeader`, `SectionCard`, `BackLink`, `LinkCard`, `EmptyState`, `SearchForm`, `Pager`, `Logo`, `SiteHeader`, `SiteFooter`.
  - Dates: `DateTimeInput`, `TimeZoneSelect`.
  - Display: `StatusPill` (tones), `StageStateBadge`, `EventCover` (Luma covers, square), `Markdown`, `ProjectVersionView`.
  - shadcn primitives in `src/components/ui/*`. Add more with `pnpm dlx shadcn@latest add <name>` - **never `-o`** (it overwrites the tuned components) - and fix the `cn` import to `@/lib/utils` if the CLI writes `from "cn"`.

## Conventions
- **Dates are always stored in UTC.** Entering a date: `<DateTimeInput timeZone>` (wall-clock time in that zone) + `toUtcIso(wall, tz)` on save, initialise with `utcToZoned(date, tz)`; pick zones with `<TimeZoneSelect>` (UTC + all IANA zones). Helpers in `src/lib/timezones.ts` (Intl only, DST-safe, tested). Never use the browser's zone for stored times. A hackathon has one `timezone` (default: the Luma event's) for all its inputs and public deadlines. Display: `formatEventRange` / `formatShortDate` with the zone; admin tables print UTC.
- Server action results are `{ ok: true, data } | { ok: false, error }` - show `error` with `toast.error`.
- Privacy policy: one policy for all team1 sites, linked as `https://go.team1.network/privacy-policy` (source in the team1-network repo). A feature that collects, shows, shares or tracks new personal data needs a policy update there.
- Analytics: self-hosted Plausible (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`), no cookies, no banner.

## Don't
- Don't use the em dash (U+2014) anywhere: code, comments, copy, docs. Use ` - ` or rephrase.
- Don't run git commands or commit unless explicitly asked.

## Images (uploads)
- Cloudflare R2 via the S3 API (`src/lib/storage/`, ported from the member portal); dev without a bucket uses `public/uploads/` (`local` provider). Env `STORAGE_*` (`.env.example`).
- Every image kind is registered in `src/lib/image-kinds.ts` (aspect, max px, max bytes, category). Upload with `<ImageUploadField kind ownerId>` (pick → crop → `uploadImage` action → URL); the server re-validates magic bytes + exact aspect (`validateImageBuffer`).
- Keys are `category/ownerId/<uuid>.ext`. **Saving a form must check the URL is an own upload** (`isOwnUpload(url, category, ownerId)`) - never accept hotlinked image URLs. Adding a kind: register it, add its owner check in `upload-actions.ts` `authorizeOwner`, check ownership where it's saved.
- Orphans (cancelled forms) stay in the bucket - harmless, unguessable.

## Areas

### Events (`src/app/(site)/events/`, admin `src/app/admin/events/`)
- The hub's own copy of **Luma** events, fetched from **public data only**: `api.lu.ma/url?url=<slug>` (unofficial web API, no key - `_lib/luma.ts`; description ProseMirror → Markdown in `_lib/prosemirror.ts`). Same `evt-…` ids and Luma CDN cover images as the member portal. Admin picker lists public team1 events from the member portal's anonymous `GET /api/v1/events` (`_lib/portal.ts`, `MEMBER_PORTAL_URL`). Daily `events-refresh` job; failures land in `Event.syncError` and the admin page - never silent. Edit events on Luma, not here.
- Two sources (`Event.source`): **luma** (a pasted Luma link, public web API) and **portal** - the admin "team1 events" tab, fetched and refreshed from the portal's key-only `GET /api/v1/events/{id}/full` (`MEMBER_PORTAL_API_KEY` needs scope `events:read:all`; `fetchPortalEvent` in `_lib/portal.ts`), never from Luma. That tab and portal imports are for **team1 members only** (stored `PortalProfile.tier` set; re-checked in `importEvent`).
- `status` draft | published | archived - only published events are public. The hourly `events-portal-import` job adds every **public** portal event the hub doesn't have yet as **published** (source portal); it never touches existing rows, so an unpublish/archive sticks. `events.manage` imports/publishes/refreshes; `hackathons.manage` implies it (`canManageEvents` in `_lib/access.ts`) and alone sees "Set up as hackathon".
- `_lib/sync.ts` has no `server-only` import on purpose: the worker uses it.

### Projects (`src/app/(app)/projects/`)
- Builder-owned, team via `ProjectMember` (one owner) + email invites (`ProjectInvite`, token hashed, 14 days, accepted only by the invited verified email; re-inviting a member is refused - never downgrades).
- **Roles** (`PROJECT_ROLES` in `_lib/rules.ts`): `reader` views · `writer` + edits, milestones, uploads, submits/withdraws · `owner` (one) + invites, revokes, sets roles, removes, transfers. Readers are **not** on the hackathon team (size, join, snapshot, one-submission clash - filter `role: { in: TEAM_ROLES }`) but still count for judges' COI.
- **Draft + sealed versions.** `Project.currentVersionId` points at the latest `ProjectVersion`. While it is a **draft** (`sealedAt` null) edits update it in place (`planSave`); builders don't see edit history. **Submitting seals it** (`planSeal`, inside the submission transaction: `sealedAt` + note "Submitted to …") and the stage entry pins it; the next edit starts a new draft (number + 1). Re-submitting without changes reuses the sealed version. **Sealed rows are immutable** - never update or delete them. Only submissions seal (grant applications will seal the same way).
- Fields follow builders-hub's battle-tested submission set (`_lib/rules.ts`: categories, tech stack defaults, limits, link normalisation) - but stored as real arrays. `missingForSubmission` = builders-hub's "complete" set; hackathon submission requires it.
- **Project stage** (`ProjectVersion.maturity`, required on save and in `missingForSubmission`; null only on versions saved before it existed): idea → prototype → MVP → testnet/beta → live → established, keys in `src/lib/project-maturity.ts` (only add). Versioned like every field, so a submission shows the stage it was judged at.
- Rendering a version: `ProjectVersionView` (`src/components/`), shared by project, organiser and judge pages.

### Profile (`src/app/(app)/profile/`, rules `src/lib/profile.ts`)
- builders-hub's profile fields (roles, socials with its regexes, wallets, skills, consents), ISO-2 countries (`src/lib/countries.ts`). `hasCompleteBasicProfile` (name + country + role) is required to join a hackathon.

### Hackathons (logic `src/app/(site)/events/_lib/hackathons/`, public page on `/events/[slug]`, organiser console `/manage/hackathons/[id]`, judges `/judge`)
- An Event becomes a hackathon (1:1). Config is typed tables: tracks, prizes (overall or per track, placement), stages (= rounds: window, review mode, scale, criteria with weights, extra questions), registration questions (`FormField`, `stageId` null), organisers and judges (invited by email, bound to the user on sign-in via the Better Auth `session.create.after` hook / immediately if a verified user exists).
- **Per-hackathon power is data, not permissions**: `canManageHackathon` = `hackathons.manage` or bound organiser. Organisers work in `/manage`, not `/admin`. Re-check it in every action via `assertManage` (`_lib/hackathons/manage.ts`).
- **Data terms**: organisers (may be external) are independent controllers of registrant data; they and judges must accept `DataTerms` once per hackathon (`termsAcceptedAt` on their row) before seeing any of it. Enforced in `getManagedHackathon` (redirects to `/manage/terms/[id]`), `assertManage`, the judge queue/review pages and `saveReview`. `hackathons.manage` holders (team1 staff) are exempt (`needsOrganizerTerms`). New organiser/judge data surfaces must go through these.
- Pure rules, all unit-tested: `rules.ts` (stage state - `closesAt` exclusive, stage validation, answers schema builder, join, publish checklist), `submissions.ts` (who may submit), `judging.ts` (COI, weighted total 0–100, ranking + tie-breaks, `assignRandom` balanced/seeded/keeps reviewed pairs, `assignAll`). Change a rule → change its test.
- Registration ("Register for Hackathon", `/events/[slug]/join`): `requireApproval` off = instantly `active`; on = `pending` until an organiser approves at `/manage/hackathons/[id]/registration` (approval mailed; rejection final). `?invite=<Hackathon.inviteToken>` auto-approves (skips approval only, not window/cap/terms); the token never leaves organiser pages (`omit` in `getPublicHackathon`). Rules: `canJoin`, `registrationStatus`.
- Flow: join (`Participant`) → team = project members, all must have joined, size within limits, one active submission per person per hackathon only if `allowMultipleSubmissions` is off (default on; submit page picks the project via `?project=`) → submit to the open stage (pins current version + team snapshot; updatable until close) → after close: judges are assigned per the stage's "who reviews" (only set on the stage) - **all judges** = live, every eligible judge gets every entry on read (`ensureAllJudgesAssigned` in `queries.ts`, no job, no mail); **random** = organiser previews → applies the draw on the Judging tab (judges mailed) → judges score (blind; only after the window closes; COI never assigned and blocked) → organiser closes judging (scores revealed) → ranking → advance teams (mailed) → next stage (only advanced teams unless the stage's `advancedOnly` is off - then any team, which picks its tracks there) … → awards per prize → publish results. CSV export at `/manage/hackathons/[id]/export.csv` (formula-injection safe).
- Structural edits are locked once judges scored (criteria, scale); stages with entries can't be deleted.

### Referrals & groups (`src/app/(app)/referrals/` - routes `/referrals`, `/groups/[slug]`, admin `/admin/groups`)
- `?ref=<code>` on any page → `src/proxy.ts` sets a first-wins `ref` cookie (30 days). Better Auth `user.create.after` → `attributeReferral` writes one `Referral` per new user (existing users never count) + a **snapshot** of the referrer's groups (`ReferralGroup`). Never blocks sign-up.
- Codes: several per user (max 10), always random (`generateCode`, never user-chosen), labelled, deactivate instead of delete. QR per link via `QrCodeDialog` (`src/components/qr-code-dialog.tsx`, builder `src/lib/qr.ts`, ported from the member portal). Rules in `_lib/rules.ts` (tested).
- Groups: **manual** groups = `GroupMember` rows (members/leads), no chapter link. **Automatic** = chapter groups: one `Group` per portal chapter (`portalChapterSlug`, read-only, created by `ensureChapterGroups`). Members/leads/tier come from a stored read-only copy (`PortalProfile`, `PortalChapterMembership`) refreshed on sign-in and after 24 h (`refreshPortalProfile`, `getPortalProfile` in `src/lib/member-portal.ts`); pages never call the portal. Portal `senior` is reported as `core`. Needs `MEMBER_PORTAL_API_KEY` (scope `members:chapters`). Chapter groups are created only for **live** chapters (`ensureChapterGroups`, on `/admin/groups` load and each refresh). An onboarding counts for the referrer's manual groups + their **primary** chapter group only (`countingGroups`, `getUserGroups().counting`).
- Visibility: referrers see counts; leads (per-object, `canViewGroup` in `src/lib/groups.ts`) and `referrals.view` see group totals + referrer name/count; nobody sees who was referred. `groups.manage` edits groups.

## Integrations (planned)
- **The member portal is read-only for the hub.** The hub only reads from it (GETs, plus lookup POSTs that carry a hash in the body) and never creates, changes or deletes data there. The portal owns members, chapters and events; the hub keeps read-only copies (`PortalProfile`, portal-sourced `Event`s). Never request a portal API key scope that allows writes.
- **Member portal** (`~/git/team1/member.team1.network`): `POST /api/v1/members/check` (scope `members:check`, body `{ emailHash }`) answers "is this a team1 member" - the intended way to give members extra features. Later also SSO via `genericOAuth`.
- **Cascade** and others call this hub's `/api/v1` with keys from `/admin/api-keys`.
- **Luma**: public data only (see Events). Don't add Luma API keys or luma-sync dependencies.

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
