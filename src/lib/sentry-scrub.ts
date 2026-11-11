// beforeSend for every Sentry (GlitchTip) client: server, browser, worker. Pure, no runtime SDK import.
// Removes what can identify a person or carry a secret: cookies, auth headers, every URL query
// string, invite tokens in paths, emails in error text, Prisma query values, and everything on
// `user` but the id.

import type { NodeOptions } from '@sentry/node'

/**
 * What the SDK may collect (v11 replaced `sendDefaultPii` with this; its defaults collect cookies,
 * headers, bodies and local variables). Shared by all clients. Local variables are off: they can hold
 * emails or codes.
 */
export const DATA_COLLECTION: NonNullable<NodeOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['user-agent', 'content-type', 'accept'] }, response: false },
  httpBodies: [],
  // Default only filters auth-ish names; OAuth code/state, invite, next and email would pass.
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
}

type Scrubbable = {
  message?: unknown
  transaction?: unknown
  request?: { url?: string; query_string?: unknown; cookies?: unknown; data?: unknown; headers?: Record<string, string> }
  user?: { id?: string | number } & Record<string, unknown>
  exception?: { values?: { type?: string; value?: string }[] }
  breadcrumbs?: { message?: unknown; data?: Record<string, unknown> }[]
  extra?: Record<string, unknown>
  tags?: Record<string, unknown>
  contexts?: { nextjs?: { request_path?: unknown } & Record<string, unknown> } & Record<string, unknown>
}

// Alphabetic TLD so pnpm paths in stacks (next@16.4.5_@babel+core@7.29.7) stay intact.
const EMAIL = /[\w.+-]+@(?:[\w-]+\.)+[a-z]{2,}\b/gi
// Path segments that are credentials. ponytail: one route today, add new token routes here.
const TOKEN_PATH = /\/projects\/invite\/[^/?#\s"'<>]+/g

/** Masks emails and token path segments in free text (error messages, stacks, URLs). */
export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(TOKEN_PATH, '/projects/invite/[token]')
}

/** scrubText on every string inside a value (objects and arrays, 5 levels deep). */
export function scrubDeep(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return scrubText(v)
  if (!v || typeof v !== 'object' || depth > 4) return v
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x, depth + 1))
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x, depth + 1)]))
}

/** Prisma error messages print the query with its values; the last line names the problem without them. */
export function shortPrismaMessage(message: string): string {
  return message.trim().split('\n').filter((l) => l.trim()).at(-1)?.trim() ?? ''
}

// Queries can carry next=, email, OAuth code/state or invite tokens, so URLs never keep theirs.
const url = (u: string) => scrubText(u.split(/[?#]/)[0]!)

/** An error's message, safe to leave the system (alerts): Prisma query values, emails and invite tokens removed. */
export function safeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return scrubText(String(err))
  return scrubText(err.name.startsWith('PrismaClient') ? shortPrismaMessage(err.message) : err.message)
}

export function scrubEvent<E extends Scrubbable>(event: E): E {
  const req = event.request
  if (req) {
    delete req.cookies
    delete req.query_string
    delete req.data
    // Same allow-list as DATA_COLLECTION, enforced here too: other headers carry cookies, IPs or query strings.
    if (req.headers) for (const k of Object.keys(req.headers)) if (!/^(user-agent|content-type|accept)$/i.test(k)) delete req.headers[k]
    if (req.url) req.url = url(req.url)
  }
  const next = event.contexts?.nextjs
  if (typeof next?.request_path === 'string') next.request_path = url(next.request_path)
  if (typeof event.transaction === 'string') event.transaction = scrubText(event.transaction)
  if (typeof event.message === 'string') event.message = scrubText(event.message)
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value !== 'string') continue
    ex.value = scrubText(ex.type?.startsWith('PrismaClient') ? shortPrismaMessage(ex.value) : ex.value)
  }
  if (event.user) event.user = event.user.id === undefined ? undefined : { id: event.user.id }
  for (const b of event.breadcrumbs ?? []) {
    if (typeof b.message === 'string') b.message = scrubText(b.message)
    // Console breadcrumbs repeat the logged text in data.arguments.
    if (b.data) b.data = scrubDeep(b.data) as Record<string, unknown>
    for (const k of ['url', 'from', 'to']) if (typeof b.data?.[k] === 'string') b.data[k] = url(b.data[k])
  }
  if (event.extra) event.extra = scrubDeep(event.extra) as Record<string, unknown>
  if (event.tags) event.tags = scrubDeep(event.tags) as Record<string, unknown>
  return event
}
