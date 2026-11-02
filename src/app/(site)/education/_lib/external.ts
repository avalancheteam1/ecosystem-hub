// ponytail: hand-copied lists, refresh by hand when the sources change.
// Workshops: README index of github.com/avalancheteam1/workshops (generated from each meta.yml).
// Courses: builders-hub components/academy/learning-path-configs/academy.config.ts.
// Fetch at build time if this goes stale too often.

export const WORKSHOPS_REPO = 'https://github.com/avalancheteam1/workshops'
export const AVAX_ACADEMY = 'https://go.team1.network/academy'
/** Course deep links - go.team1.network only forwards the overview. */
export const AVAX_COURSE_BASE = 'https://build.avax.network/academy'

export type Workshop = { slug: string; title: string; level: 'beginner' | 'intermediate' | 'advanced'; duration: string; languages: string[] }

/** Sorted like the repo index: by level, then order. */
export const WORKSHOPS: Workshop[] = [
  { slug: 'getting-started', title: 'Getting Started with Avalanche', level: 'beginner', duration: '45 minutes', languages: ['en', 'de'] },
  { slug: 'build-your-first-dapp', title: 'Build Your First dApp', level: 'beginner', duration: '1 hour', languages: ['en'] },
  { slug: 'guestbook', title: 'On-chain Guestbook', level: 'beginner', duration: '30 minutes', languages: ['en'] },
  { slug: 'hackathon-prep', title: 'Hackathon Prep with Avalanche', level: 'intermediate', duration: '3 hours', languages: ['en'] },
  { slug: 'sealed-bid-auctions', title: 'Sealed-bid Auctions on a Public Blockchain', level: 'intermediate', duration: '1 hour', languages: ['en'] },
  { slug: 'merkle-airdrop', title: 'Merkle-tree Airdrops', level: 'intermediate', duration: '2 hours', languages: ['en'] },
  { slug: 'deploy-your-own-eerc-token', title: 'Deploy Your Own eERC Token', level: 'advanced', duration: '2.5 hours', languages: ['en'] },
]

export const workshopHref = (w: Workshop, lang = w.languages[0]) => `${WORKSHOPS_REPO}/blob/main/workshops/${w.slug}/${lang}/README.md`

export type AvaxCourse = { slug: string; title: string; description: string; stage: 'Foundations' | 'Core' | 'Advanced' }

/** Avalanche Academy on build.avax.network, by part in reading order. */
export const AVAX_COURSES: { part: string; courses: AvaxCourse[] }[] = [
  { part: 'Fundamentals', courses: [
    { slug: 'blockchain/blockchain-fundamentals', title: 'Blockchain Fundamentals', description: 'Learn the basics of blockchain and Solidity', stage: 'Foundations' },
    { slug: 'avalanche-l1/avalanche-fundamentals', title: 'Avalanche Fundamentals', description: 'Learn about Avalanche Consensus, Multi-Chain Architecture, and VMs', stage: 'Foundations' },
  ] },
  { part: 'L1 Development', courses: [
    { slug: 'avalanche-l1/permissioned-l1s', title: 'Permissioned L1s', description: 'Create and manage permissioned blockchains with Proof of Authority', stage: 'Core' },
    { slug: 'avalanche-l1/l1-native-tokenomics', title: 'L1 Native Tokenomics', description: 'Design L1 economics with custom token, native minting rights and transaction fees', stage: 'Core' },
    { slug: 'avalanche-l1/permissionless-l1s', title: 'Permissionless L1s', description: 'Create and manage permissionless blockchains with Proof of Stake', stage: 'Advanced' },
  ] },
  { part: 'Interoperability', courses: [
    { slug: 'avalanche-l1/interchain-messaging', title: 'Interchain Messaging', description: "Build apps leveraging Avalanche's Interchain Messaging", stage: 'Core' },
    { slug: 'avalanche-l1/erc20-bridge', title: 'ERC20 Bridge', description: 'Bridge ERC20 tokens between chains using Interchain Token Transfer', stage: 'Advanced' },
    { slug: 'avalanche-l1/native-token-bridge', title: 'Native Token Bridge', description: 'Build a cross-chain L1 with native tokenomics and token bridging', stage: 'Advanced' },
  ] },
  { part: 'VM Customization', courses: [
    { slug: 'avalanche-l1/customizing-evm', title: 'Customizing the EVM', description: 'Add custom precompiles and configure the EVM', stage: 'Core' },
    { slug: 'avalanche-l1/access-restriction', title: 'Access Restriction', description: 'Control who can transact and deploy contracts with allowlist precompiles', stage: 'Advanced' },
  ] },
  { part: 'Applications', courses: [
    { slug: 'blockchain/solidity-foundry', title: 'Intro to Solidity', description: 'Learn Solidity basics with Foundry', stage: 'Foundations' },
    { slug: 'blockchain/x402-payment-infrastructure', title: 'x402 Payments', description: 'Instant & permissionless HTTP-native payments on Avalanche', stage: 'Core' },
    { slug: 'blockchain/encrypted-erc', title: 'Encrypted ERC', description: 'Learn about eERC tokens to add privacy to your applications', stage: 'Core' },
  ] },
]
