// Avalanche Builder Hub (build.avax.network) - docs, academy and dev tools live there;
// this hub is for hackathons, events and community. Link out instead of duplicating.
// Prefer the go.team1.network short links: they carry team1's ref code and are tracked.
const BUILDER_HUB_SITE = 'https://build.avax.network'
export const BUILDER_HUB_URL = 'https://go.team1.network/builderhub'
export const ACADEMY_URL = 'https://go.team1.network/academy'
// ponytail: no tracked links for console and grants yet - swap in when they exist
export const GRANTS_URL = `${BUILDER_HUB_SITE}/grants`

export const BUILDER_HUB_LINKS = [
  { href: 'https://go.team1.network/docs', label: 'Docs', body: 'Avalanche C-Chain, L1s, interop and APIs.' },
  { href: ACADEMY_URL, label: 'Academy', body: 'Free courses, from blockchain basics to your own L1.' },
  { href: `${BUILDER_HUB_SITE}/console`, label: 'Console', body: 'Launch and manage L1s, validators and bridges.' },
  { href: 'https://go.team1.network/faucet', label: 'Faucet', body: 'Testnet AVAX for building and testing.' },
]
