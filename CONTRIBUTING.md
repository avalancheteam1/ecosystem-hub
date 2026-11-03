# Contributing

The hub runs real hackathons, bounties and builder data, so the bar for changes is high. Read this before you start - PRs that ignore it are closed without review.

## What we expect: feature ownership

Coding is often fast, especially with AI. What we value is everything around it: solving the right problem, a design that fits the existing architecture, behaviour that is verified, and a result polished for the people using it. When you take on a change, you own it end to end - problem, design, implementation, verification, polish and docs. Think like a product owner and an architect, not like someone closing a ticket.

## Before you start

For anything beyond a small fix, align with us in an issue first - we check it's wanted and nobody else is on it (an assigned issue is taken). Then think the design through: which existing models, rules and components you reuse ([AGENTS.md](AGENTS.md)), who may see and do what, and the UI flow including empty and error states.

## What every PR must meet

- **One change per PR.** Touch only what the change needs. Small refactoring that serves the change is fine; larger refactors, mass reformatting or renames get their own PR, aligned first. Unrelated issues go into a separate issue.
- **No tool files.** Nothing your tools generate for themselves belongs in the repo: AI agent folders and instruction files (`.cursor/`, `.claude/`, `GEMINI.md`, ...), plans, specs and notes written by agents or skills, Playwright output, editor settings. Follow the local working files convention in [AGENTS.md](AGENTS.md): use the gitignored `.local/` directory; `docs/` is for maintained, shared documentation. `AGENTS.md`, `CLAUDE.md` and the shared skills in `.agents/skills/` are the only agent files we keep. Our `.gitignore` covers the tools we use; for anything else yours creates, use your global gitignore (`git config --global core.excludesFile ~/.gitignore`).
- **Follow [AGENTS.md](AGENTS.md).** It is the rulebook for structure, permissions, security and design (e.g. every server action goes through `action()`, every admin page calls a guard).
- **Green checks.** `pnpm typecheck && pnpm lint && pnpm test` pass locally; lint has zero warnings. CI runs the same.
- **Tests.** New or changed logic comes with tests in `tests/` that fail without your change. A bug fix includes a test that reproduces the bug.
- **Database: at most one migration per PR**, created with `pnpm db:migrate --name <change>`, never `prisma db push`. Squash your migrations into one before review and rebase so yours is the newest. Never edit an existing migration. Migrations must be safe while the previous version is still running (add columns nullable or with defaults; drop in a later release).
- **A short description:** a few lines on what and why, the linked issue, and screenshots for UI changes. No long generated write-ups - we verify by running your branch.

## Before you request review

- **Reuse:** existing models, rules and components are used - no parallel version of something that already exists.
- **Permissions:** a registry key or per-object rule, `action()` on every write, a guard on every page, an audit entry for every change.
- **Tried as a user:** as every affected role (signed out, builder, organiser, judge, admin). Every link and button you added or touched works. Empty, error and loading states, mobile, light and dark, keyboard. Every text proofread.
- **Data:** no N+1 queries, only the fields you need, no personal data you don't need. New personal data needs a privacy-policy note.
- **Docs:** AGENTS.md updated if you added an area, a rule or a convention.
- **Your diff:** you read it top to bottom yourself.
- **Agent review:** run the `team1-hub-review` skill (`.agents/skills/`, read by Codex, Cursor, OpenCode, Antigravity and Claude Code) and fix what it finds.

## Dependencies

Every dependency is code we have to trust, update and ship. Before adding one:

- Prefer what is already there: the platform, the standard library, an installed package or a few lines of our own.
- A new package is fine when it does something hard to get right - security, crypto, parsing, protocols, a well-known UI primitive. It should be widely used, actively maintained, and need no install scripts.
- Say in the PR why it is needed and which alternatives you considered. Maintainers may ask you to drop it.
- Use `pnpm` only and commit the updated `pnpm-lock.yaml`. Don't change the package manager or unrelated versions.

## Never acceptable

These get the PR closed and may get the account blocked:

- Promotion of any kind: links to your own projects, tokens, airdrops, referral or affiliate links, wallet addresses, ads, "powered by" credits.
- New tracking, analytics or calls to new external services that weren't agreed with a maintainer first.
- Obfuscated or minified code, committed binaries or build output, install scripts, anything that hides what it does.
- Secrets or real personal data, including in tests and fixtures.

## AI tools

AI tools are welcome, up to fully AI-written changes. **You are fully responsible for everything in your PR** - correctness, security, licensing and these rules - exactly as if you had written it by hand. "The AI did it" is never an answer in review. Unreviewed, generated bulk PRs are closed.

AGENTS.md is written for agents too (Claude Code, Codex and others load it automatically). Make sure yours follows it, then check its output against "Before you request review" yourself.

## Review

Every PR needs an approval from a code owner (`.github/CODEOWNERS`). We may ask for changes, split a PR, or decline it if it doesn't fit - that is not personal.

- **Review is not QA.** If we hit several obvious problems within the first minutes of trying a PR - a social link that does nothing, a button that fails, typos - we close it with one comment. Fix everything, then open a new PR.
- **A PR that needs basic rework** (wrong model, bypasses the permission system, ignores the existing architecture) is closed with a short reason - go back to the issue. A well-prepared PR should need at most one round of changes.
- PRs without activity for 30 days are closed.

## Security issues

Don't open a public issue. Report it privately via **Security → Report a vulnerability** on GitHub.

## License

By contributing you agree that your contribution is licensed under this repository's [BSD 3-Clause License](LICENSE). The team1 name and logos are trademarks and are not covered by it.
