# Judges see the team

Status: idea (2026-10-11)

## Why

The team is one of the most important judging inputs, but judges currently see only the project version and stage answers - no names. That isn't a deliberate blind-judging rule ("blind" here only means judges don't see each other's scores); the team was simply never added. Judges have accepted the judge terms (`DataTerms`: confidential, only for judging) before they see anything, so showing the team is now covered.

## What judges would see

| Show | Why |
|---|---|
| Name | From `StageEntry.teamSnapshot` (team at submission), like the pinned version |
| Builder roles + skills | The core of "can this team ship?" |
| GitHub, LinkedIn, X links | Where judges check track records |
| ~~Email, country, wallets, Telegram~~ | Not needed to judge - data minimisation |

Roles, skills and links come from the **current** profile (the snapshot only stores `userId` + `name`). Once the public developer profile exists, this becomes "name + link to their public profile" and the per-field choice moves there.

Where: the judge review page `src/app/(app)/judge/[hackathonId]/[assignmentId]/page.tsx`, a team block next to `ProjectVersionView`.

## Changes that come with it

- **Privacy policy** (`~/git/team1/team1-network/content/privacy-policy.md`, §4 Ecosystem Hub): "judges see only the project" becomes "judges see the project and the team: names, roles, skills and professional links".
- **Join form + submit page notice**: same wording, so builders know before submitting.
- **Conflict of interest**: improves - judges can spot conflicts themselves (e.g. a former colleague), not only the automatic same-team check.

## Out of scope for now

- **Blind rounds**: some organisers anonymise a first round to reduce bias. Skip a "hide team from judges" flag until an organiser asks; it would be a `HackathonStage` boolean.
- **Public developer profile**: separate feature, planned later.
