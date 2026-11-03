# team1 Ecosystem Hub

`hub.team1.network` - hackathons, workshops, bounties, education and projects for builders in the team1 / Avalanche ecosystem.

Contributor and agent guide: **[AGENTS.md](AGENTS.md)** (structure, permissions, conventions). How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md).

## Local setup

Requires Node 24, pnpm and Docker.

```bash
cp .env.example .env            # set BETTER_AUTH_SECRET and your email in SUPER_ADMIN_EMAILS
docker compose up -d            # Postgres on localhost:5433
pnpm install
pnpm db:migrate                 # apply migrations
pnpm dev                        # http://localhost:3000
pnpm worker                     # background jobs (separate terminal) - or `pnpm dev:all`
```

Without SMTP settings, email sign-in codes are printed in the `pnpm dev` console.
Google/GitHub sign-in work once their client id/secret are set (callback URLs in `.env.example`).

Checks: `pnpm typecheck && pnpm lint && pnpm test`.

## License

[BSD 3-Clause](LICENSE), copyright Avalanche Team1. The Entrepreneur Academy content is adapted from [Avalanche Builders Hub](https://github.com/ava-labs/builders-hub) (BSD 3-Clause, Ava Labs) - see its [LICENSE](src/app/(site)/education/_content/entrepreneur/LICENSE). The team1 name and logos are trademarks and are not covered by the license.
