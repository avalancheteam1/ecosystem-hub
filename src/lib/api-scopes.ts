// Scopes of server-to-server API keys (/api/v1). Pure. A key's power is exactly
// its scopes — it never inherits the power of the admin who created it.
// Persisted in ApiKey.scopes: only ever ADD scopes.

export const API_SCOPES = {
  'users:check': 'Check whether a hashed email belongs to an Ecosystem Hub user (yes/no only)',
} as const

export type ApiScope = keyof typeof API_SCOPES

export function isApiScope(s: string): s is ApiScope {
  return Object.hasOwn(API_SCOPES, s)
}
