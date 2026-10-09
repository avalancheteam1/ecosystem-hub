/** How far a project is — stored on the version, so a submission keeps the stage it was judged at. Keys are persisted: only add. */
export const PROJECT_MATURITY = {
  idea: { label: 'Idea', hint: 'Concept or design — nothing built yet' },
  prototype: { label: 'Prototype', hint: 'Proof of concept or hackathon build' },
  mvp: { label: 'MVP', hint: 'Core features work, early testers' },
  testnet: { label: 'Testnet / beta', hint: 'Deployed on testnet or in public beta' },
  live: { label: 'Live', hint: 'Launched on mainnet, first users' },
  established: { label: 'Established', hint: 'Steady users or revenue, growing' },
  archived: { label: 'Archived', hint: 'No longer active or maintained' },
} as const
export type ProjectMaturity = keyof typeof PROJECT_MATURITY
