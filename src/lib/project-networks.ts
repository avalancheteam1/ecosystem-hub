/** Where a project's contract is deployed. Keys are persisted (in ProjectVersion.deployedAddresses) — only add, never rename. */
export const PROJECT_NETWORKS = {
  'c-chain': { label: 'C-Chain' },
  fuji: { label: 'Fuji testnet' },
  l1: { label: 'Avalanche L1' },
  other: { label: 'Other chain' },
} as const
export type ProjectNetwork = keyof typeof PROJECT_NETWORKS
export const DEFAULT_NETWORK: ProjectNetwork = 'c-chain'

/** Label for a stored network key; null for rows saved before networks existed. */
export const networkLabel = (n: string | null | undefined) => (n ? (PROJECT_NETWORKS[n as ProjectNetwork]?.label ?? n) : null)
