# Grants

Root AGENTS.md and CONTRIBUTING.md apply. This area reuses Hub projects, sessions, permissions, UI, audit and the shared project-submission rules. No internal JSON UI API, independent account system or duplicate project table.

- Public discovery is under `(site)/grants`; private applicant pages call `requireUser` and query current project membership. Readers may view; only current owner/writers may act. Staff routes call `requirePermission('grants.review')`. Nav mirrors that guard.
- Every exported server action is wrapped in `action`. Command writes re-read membership and effective capability, reject project-member self-review, and compare revisions in a serializable transaction. Missing object access throws `ForbiddenError`.
- Grant state is validated by `stateSchema`, stored as an aggregate plus an append-only `GrantRevision` receipt in the same transaction. Never accept a client state replacement or callback. The head revision is optimistic concurrency control. New schemas require a versioned state migration rather than silently changing stored state.
- Submission seals the existing current `ProjectVersion` atomically, using shared rules; later project edits do not rewrite application snapshots. Live `ProjectMilestone` is not agreed grant terms.
- Only staff with decision permission may release applicant-facing review statuses or reopen a deferred application. Reopening keeps the decision history and prompts a fresh assessment.
- Assessment, readiness, call priority, authorised award, confirmation, acceptance, payment and impact review are separate. The internal v2.0 template and 30/90/180-day monitoring remain proposed defaults until programme owners adopt them.
- Applicants receive an explicit server allowlist, never internal assessments/notes, authority/budget references, finance references or manual follow-ups. Payment evidence is rendered only with `grants.payments`.
- USD uses integer cents. Payment records describe external finance activity; there is no transfer, wallet or provider integration. External references are unique across grants. Only confirmed records count as paid; reported/uncertain/disputed amounts reserve the obligation.
- Amendments are bounded to confirmed terms before acceptance/payment records. Renewed approval does not activate terms; applicant confirmation creates the next active version. Preserve prior versions and rejected/withdrawn proposals.
- Dates for deadlines are validated UTC calendar days, instants are server-generated UTC timestamps. Monitoring is anchored to accepted delivery. Blank observed metrics are unmeasured, not zero; measured values need evidence and method. Never sum cumulative checkpoint values or automatically rewrite c9.
- Reminder text is a draft only. No automatic send, external sync, award, XP or follow-on grant.
- Full round snapshots freeze every submitted member, source, hold and owner choice independently of client selection/filtering. They are read-only. Call choices cannot change scores, original intake categories or funding.
