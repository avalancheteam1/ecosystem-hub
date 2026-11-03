# Projects

Rules for this area. The root `AGENTS.md` applies too.

## Projects (`src/app/(app)/projects/`)
- Builder-owned, team via `ProjectMember` (one owner) + email invites (`ProjectInvite`, token hashed, 14 days, accepted only by the invited verified email; re-inviting a member is refused - never downgrades).
- **Roles** (`PROJECT_ROLES` in `_lib/rules.ts`): `reader` views · `writer` + edits, milestones, uploads, submits/withdraws · `owner` (one) + invites, revokes, sets roles, removes, transfers. Readers are **not** on the hackathon team (size, join, snapshot, one-submission clash - filter `role: { in: TEAM_ROLES }`) but still count for judges' COI.
- **Draft + sealed versions.** `Project.currentVersionId` points at the latest `ProjectVersion`. While it is a **draft** (`sealedAt` null) edits update it in place (`planSave`); builders don't see edit history. **Submitting seals it** (`planSeal`, inside the submission transaction: `sealedAt` + note "Submitted to …") and the stage entry pins it; the next edit starts a new draft (number + 1). Re-submitting without changes reuses the sealed version. **Sealed rows are immutable** - never update or delete them. Only submissions seal (grant applications will seal the same way).
- Fields follow builders-hub's battle-tested submission set (`_lib/rules.ts`: categories, tech stack defaults, limits, link normalisation) - but stored as real arrays. `missingForSubmission` = builders-hub's "complete" set; hackathon submission requires it.
- **Project stage** (`ProjectVersion.maturity`, required on save and in `missingForSubmission`; null only on versions saved before it existed): idea → prototype → MVP → testnet/beta → live → established, keys in `src/lib/project-maturity.ts` (only add). Versioned like every field, so a submission shows the stage it was judged at.
- Rendering a version: `ProjectVersionView` (`src/components/`), shared by project, organiser and judge pages.
