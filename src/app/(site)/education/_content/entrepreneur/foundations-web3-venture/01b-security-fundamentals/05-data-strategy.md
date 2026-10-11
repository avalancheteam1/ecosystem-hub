### On-Chain vs. Off-Chain Data Considerations

::youtube[uL5Q32r-Wuo]

> **"You should treat off-chain data as trustless, which means that you cannot rely on data off-chain. But you can have some kind of proof of computation or some kind of proof of validity of that data on-chain"** - [Martin Prado](https://www.linkedin.com/in/martinprado/), Chief Information Security Officer at Ava Labs

When deciding where to store data, consider:

- **On-chain storage** is appropriate for:
  - Immutable, transparent, censorship-resistant data
  - Token information
  - Ownership records (like Non-Fungible Tokens - NFTs)
  - Deterministic logic

- **Off-chain storage** is better for:
  - Most other types of data
  - Cost-efficient storage
  - Easier processing

A hybrid approach often works best: store data off-chain but keep proofs of validity on-chain. Zero-Knowledge Proofs are an emerging solution in this space.

### Privacy Principles

To maintain user privacy:
- Only collect information you actually need
- Assess the nature of the data you're collecting
- Keep on-chain complexity to a minimum
- Plan for potential future migration between on-chain and off-chain storage
- Balance security, cost, and performance requirements
