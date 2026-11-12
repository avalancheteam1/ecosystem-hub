import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'
import { getRequestIp } from '@/lib/request-ip'
import { securityEvent } from '@/lib/security-events'
import { authResponseEvent } from '@/lib/security-rules'

// Better Auth's captcha plugin and rate limiter answer in its router, before `hooks.before`
// runs, so failed captchas (400/403) and 429s are only visible here, on the response.
const handler = toNextJsHandler(auth)

function withSecurityEvents(run: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await run(req)
    if (res.status === 400 || res.status === 403 || res.status === 429) {
      const code = res.status === 429 ? undefined : await res.clone().json().then((b) => b?.code, () => undefined)
      const type = authResponseEvent(res.status, code)
      if (type) securityEvent(type, { ip: getRequestIp(req.headers) ?? undefined, detail: { path: new URL(req.url).pathname } })
    }
    return res
  }
}

export const GET = withSecurityEvents(handler.GET)
export const POST = withSecurityEvents(handler.POST)
