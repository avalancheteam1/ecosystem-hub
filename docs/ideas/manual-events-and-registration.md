# Manual events + in-hub event registration

Status: idea, brainstorm in progress (2026-10-11). Next step: confirm approach + PR split (see "Open"), present the remaining design sections, then write a spec in `docs/superpowers/specs/` and a plan.

## Why

Today every event is a copy of a Luma event (or a portal event, which is also Luma). Two problems:

- **Events not on Luma at all** (online programs, university events) can't exist in the hub. Main reason.
- **Hackathons longer than their Luma event**: a 1-month hackathon whose Luma event is 1 day drops off "upcoming" after day 1, because `upcomingEventWhere` (`src/app/(site)/events/_lib/queries.ts:6`) only looks at `Event.endAt`, and `events-refresh` overwrites `endAt` from Luma daily. Hackathon stage windows are ignored for listing. (Separate small fix also possible: treat a published hackathon with an open stage as upcoming.)

Related, not in scope: linking two Luma events (hackathon kickoff + closing event). `Hackathon.eventId` is `@unique`; a `finaleEventId` was floated as a later idea.

## Decided

- **Source `manual`** next to `luma` / `portal`, on the same `Event` table. `lumaEventId` and `lumaUrl` become nullable (two `DROP NOT NULL`s, deploy-safe; NULLs don't collide in the unique index). Rejected: fake `manual-<cuid>` ids; a separate `ManualEvent` model.
- **Never synced**: `events-refresh` filters `source: { not: 'manual' }`, `refreshEventFromSource` refuses manual. Portal-import dedupe and admin `importedIds` skip NULLs.
- **Detach** a Luma/portal event → `manual` (one-way, `ConfirmButton`, audit `event.detach`). Keeps `lumaEventId`/`lumaUrl`, so re-importing the same link says "already imported" and "Open on Luma" can stay. Covers the long-hackathon case: import, detach, stretch the end date.
- **Who**: only `events.manage` (implied by `hackathons.manage`, `canManageEvents`). No new permission, no organiser editing, no builder-submitted events.
- **Fields** (same as Luma): title, cover, timezone, start, end (optional, after start), online flag, city / country (ISO-2) / address (hidden when online), Markdown description.
- **Cover**: new image kind `event-cover` in `src/lib/image-kinds.ts`, square (matches `EventCover`'s `aspect-square`), ~1200px, 2 MB, category `event-covers`, owner = event id (form pre-generates the cuid so upload works before create). Owner check in `upload-actions.ts` `authorizeOwner`; save checks `isOwnUpload` unless the value is unchanged (a detached event keeps its Luma CDN URL).
- **Slug**: slugified from the name on create, `-2`/`-3` on collision, fixed afterwards.
- **Admin UI**: "New event" next to Import on `/admin/events` → full page `/admin/events/new` (too long for a dialog). Saves as draft, audit `event.create`. Manual events get "Edit" (`/admin/events/[id]/edit`, audit `event.update`); Luma/portal events get "Detach". Detail page hides Refresh / "Last synced" / "Description from Luma" for manual; "Open on Luma" only if `lumaUrl` is set.
- **Events and hackathons stay separate**: a manual event is just an event; "Set up as hackathon" stays optional.
- **Registration per event**: `registration: 'hub' | 'external' | 'none'` + `registrationUrl` (https, required when external).

  | Event | Default | Admin can switch to |
  |---|---|---|
  | Manual | hub | external · none |
  | Luma / portal | external = its Luma link (as today) | — Luma stays on Luma |
  | Detached | keeps what it had | any |
  | Hackathon (any source) | the hackathon's own registration (`Participant`); event registration hidden | — |

- **In-hub registration reuses the hackathon registration**: window, cap, approval + approval mail, invite link, terms, organiser-defined questions.

## Proposed, awaiting the user's OK

**Approach 1** (recommended):
- New `EventRegistration` (eventId, userId, answers, status active/pending/rejected/withdrawn, termsAcceptedAt), `@@unique([eventId, userId])`.
- Registration settings as nullable columns on `Event` (opens/closes, max, requireApproval, inviteToken, termsUrl).
- `FormField`: `eventId` optional, `hackathonId` optional, check exactly one is set, so `FieldList`, `AnswerFields` / `AnswerList` and `buildAnswersSchema` are reused.
- Generalise `canJoin` / `registrationStatus` (`src/app/(site)/events/_lib/hackathons/rules.ts`) for both.
- `JoinForm`, `FieldList`, `ApprovalSettings` / `ReviewButtons` take an owner instead of `hackathonId`. `Participant` and teams stay untouched.
- Rejected: moving all hackathon registration onto the Event (risky migration through teams/submissions/COI/CSV); copying the code.

**Split**: one spec, two PRs:
1. Manual events: create / edit / detach, cover, registration mode + URL, public display ("Register" button → URL; none = no button).
2. In-hub registration: tables, `/events/[slug]/register`, admin `/admin/events/[id]/registration` (settings, questions, review, attendee list, CSV export), "My events" on the dashboard.

## Open

- User's OK on approach 1 + the two-PR split (last question asked).
- Remaining design sections: public page + listing, in-hub registration details (profile completeness required like hackathons? cancel by user? confirmation mail?), testing (`tests/events-manual.test.ts` for slugify / date checks; extend the rules tests for the generalised `canJoin`).
- **Privacy policy** (`~/git/team1/team1-network/content/privacy-policy.md`, §4 Ecosystem Hub): in-hub registration stores who attends which event, so it needs an update.
- Add `event.create` / `event.update` / `event.detach` and registration audit actions; the new pages go into `src/app/sitemap.ts` only via the existing event slug pages.

## Key code

- `prisma/schema/events.prisma`, `prisma/schema/hackathons.prisma` (`FormField`, `Participant`)
- `src/app/(site)/events/_lib/{actions,sync,queries,portal}.ts`, `_lib/jobs/events-refresh.ts`, `_lib/jobs/events-portal-import.ts`
- `src/app/(site)/events/_lib/hackathons/{rules,participant-actions,setup-actions}.ts`
- `src/app/admin/events/page.tsx`, `src/app/admin/events/[id]/page.tsx`
- `src/app/(site)/events/[slug]/page.tsx` ("Register on Luma" button), `[slug]/join/*`
- `src/app/(app)/manage/hackathons/[id]/registration/page.tsx`, `../_components/{field-editor,registration-controls}`
- `src/components/event-cover.tsx`, `src/lib/image-kinds.ts`

## Suggested skills for the next session

- `superpowers:brainstorming`: resume at "approach + split approval" (architectural path), then the spec.
- `superpowers:writing-plans`: after the spec is approved.
- `a31-house-conventions`: before any code (dates/timezones, forms, permissions, reuse).
- `supabase-postgres-best-practices`: for the migration (nullable columns, `FormField` check constraint).
- `team1-frontend-design`: for the create/edit form and the registration pages.
- `a31-verify-change`: after implementing, to drive the admin and register flows in a browser.
