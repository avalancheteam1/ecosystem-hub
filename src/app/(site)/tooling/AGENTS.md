# Tooling

Rules for this area. The root `AGENTS.md` applies too.

## Tooling (`src/app/(site)/tooling/` - routes `/tooling`, `/tooling/[slug]`)
- A public list of **tools built by Avalanche community members, with public code** (SDKs, web tools, bots), each with its own page. Official team1 / Ava Labs tools are listed apart (`official`), so they never read as community-built.
- **Content is one file in git:** `_content/tools.json` (`categories`, `tools`, `official`), added and changed by PR. **The PR review is the listing review** - nothing is listed without a team1 reviewer merging it. No database, no admin page, no uploads.
- The list reads `?q=` (search, every word must match name, purpose, builder, category or language; case and accents ignored), `?category=` and `?page=` server-side (`viewTools`). Chips are the categories that have tools, counted within the search. A picked category stays picked even when the search finds nothing in it (the empty state offers "Search all categories"); an unknown category means "all"; the page is clamped to the last one.
- Later: listing builders' own hub projects (marked Developer Tooling, reviewed by team1) needs public project pages first - see the projects area.

## Adding a tool
1. Add an entry to `tools` in `_content/tools.json`:
   - `slug`: the page address `/tooling/<slug>` - lowercase words joined by hyphens, never reused.
   - `category`: a `slug` from `categories`. A category with no tools never shows.
   - `purpose`: one plain sentence. `note`: the one thing a builder should know before using it (a limit, a dependency, a risk), or `null`.
   - `builder`: `{ name, url? }`. `licence`: the SPDX id from the repo, or `null` when the repo has no licence file. `language`, `install`: or `null`.
   - `links`: at least one, all `https://`. The first is the main button.
   - `logo` (optional): a square PNG, SVG or WebP at `public/tooling/<slug>.<ext>`, written as `/tooling/<slug>.<ext>`. Without one the card shows the tool's initials.
   - `checked`: the date (`YYYY-MM-DD`) you read the repo and docs.
2. Only real projects whose code is public. No licence is allowed (the page says so), but never claim one. No safety or audit claims in the copy.
3. `pnpm test` - `tests/tooling.test.ts` checks every entry (unique slug, known category, https links, real date, logo file exists).
