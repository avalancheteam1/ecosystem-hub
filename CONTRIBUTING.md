# Contributing

Thanks for helping build the team1 Ecosystem Hub.

1. **Read [AGENTS.md](AGENTS.md) first** - structure, permissions, security rules and conventions. PRs that break its rules (e.g. a server action without `action()`) won't be merged.
2. **Local setup** is in the [README](README.md). No real credentials needed: email sign-in codes print to the `pnpm dev` console.
3. **Open an issue first** for anything bigger than a small fix, so we can agree on the approach before you write it.
4. **One PR per change**, touching only its own area's folders. Run `pnpm typecheck && pnpm lint && pnpm test` before pushing; CI runs the same checks.
5. Every PR is reviewed by a code owner (`.github/CODEOWNERS`) before it is merged.

## Security issues

Please don't open a public issue. Report it privately via **Security → Report a vulnerability** on GitHub.

## License

By contributing you agree that your contribution is licensed under this repository's [BSD 3-Clause License](LICENSE). The team1 name and logos are trademarks and are not covered by it.
