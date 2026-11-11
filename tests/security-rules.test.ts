import assert from 'node:assert/strict'
import { describe, expect, test } from 'vitest'
import { authResponseEvent, createSecurityGate } from '@/lib/security-rules'

const MIN = 60_000
const T0 = 1_700_000_000_000

describe('security rules', () => {
  test('9 wrong codes on one email in 15 min stay silent, the 10th alerts', () => {
    const g = createSecurityGate()
    for (let i = 0; i < 9; i++) {
      assert.equal(g.evaluate('auth.otp.failed', 'a@x', T0 + i * 1000).alert, null)
    }
    const r = g.evaluate('auth.otp.failed', 'a@x', T0 + 9000)
    assert.equal(r.alert?.priority, 3)
    assert.equal(r.alert?.title, 'Security: auth.otp.failed')
  })

  test('a university burst does not alert', () => {
    const g = createSecurityGate()
    for (let i = 0; i < 150; i++) {
      assert.equal(g.evaluate('auth.otp.failed', `user${i}`, T0 + i * 1000).alert, null)
    }
  })

  test('credential spraying across many accounts alerts once at 500 in 10 min with priority 5', () => {
    const g = createSecurityGate()
    const alerts = []
    for (let i = 0; i < 600; i++) {
      const a = g.evaluate('auth.otp.failed', `user${i}`, T0 + i * 1000).alert
      if (a) alerts.push({ i, a })
    }
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].i, 499)
    assert.equal(alerts[0].a.priority, 5)
  })

  test('a hackathon kickoff (10k sign-ins, 2% = 200 wrong codes in 10 min) stays silent', () => {
    const g = createSecurityGate()
    for (let i = 0; i < 200; i++) {
      assert.equal(g.evaluate('auth.otp.failed', `builder${i * 50}`, T0 + i * 3000).alert, null)
    }
  })

  test('100k events on one key and on the global key stay fast and alert once each', () => {
    const g = createSecurityGate()
    const start = performance.now()
    let perTarget = 0
    for (let i = 0; i < 100_000; i++) if (g.evaluate('auth.2fa.failed', 'u1', T0 + i).alert) perTarget++
    let global = 0
    for (let i = 0; i < 100_000; i++) if (g.evaluate('auth.otp.failed', `user${i}`, T0 + i).alert) global++
    // Generous bound for a loaded CI box (alone ~160 ms); the old unbounded arrays took ~90 s per 100k on one key.
    assert.ok(performance.now() - start < 1500, `took ${performance.now() - start} ms`)
    assert.equal(perTarget, 1)
    assert.equal(global, 1)
  })

  test('21 invalid API keys with random prefixes alert exactly once', () => {
    const g = createSecurityGate()
    const alerts = []
    for (let i = 0; i < 21; i++) alerts.push(g.evaluate('api.key.invalid', 'api.key.invalid', T0 + i).alert)
    assert.equal(alerts.filter(Boolean).length, 1)
  })

  test('priority-5 alerts bypass the hourly cap', () => {
    const g = createSecurityGate()
    for (let i = 0; i < 22; i++) g.evaluate('api.scope.denied', `t${i}`, T0 + i)
    assert.equal(g.evaluate('auth.2fa.locked', 'u1', T0 + 100).alert?.priority, 5)
  })

  test('action.forbidden alerts on the 5th event of one user, not the first', () => {
    const g = createSecurityGate()
    const alerts = []
    for (let i = 0; i < 5; i++) alerts.push(g.evaluate('action.forbidden', 'u1', T0 + i).alert)
    assert.deepEqual(alerts.slice(0, 4), [null, null, null, null])
    assert.equal(alerts[4]?.title, 'Security: action.forbidden')
  })

  test('2fa lockout alerts immediately with priority 5', () => {
    const g = createSecurityGate()
    assert.equal(g.evaluate('auth.2fa.locked', 'u1', T0).alert?.priority, 5)
  })

  test('the same rule and target alerts at most once per hour', () => {
    const g = createSecurityGate()
    let first = null
    for (let i = 0; i < 10; i++) first = g.evaluate('auth.otp.failed', 'a@x', T0 + i).alert
    assert.ok(first)
    for (let i = 0; i < 30; i++) {
      assert.equal(g.evaluate('auth.otp.failed', 'a@x', T0 + 100 + i).alert, null)
    }
    const later = T0 + 61 * MIN
    let again = null
    for (let i = 0; i < 10; i++) again = g.evaluate('auth.otp.failed', 'a@x', later + i).alert
    assert.ok(again)
  })

  test('after 20 alerts in an hour one suppressed notice, then silence', () => {
    const g = createSecurityGate()
    const out = []
    for (let i = 0; i < 22; i++) out.push(g.evaluate('api.scope.denied', `t${i}`, T0 + i).alert)
    for (let i = 0; i < 20; i++) assert.equal(out[i]?.title, 'Security: api.scope.denied')
    assert.equal(out[20]?.title, 'Security alerts suppressed')
    assert.equal(out[21], null)
  })

  test('non-immediate types (incl. failed codes) stop being captured after 50 per hour, immediate types never do', () => {
    const g = createSecurityGate()
    for (const type of ['auth.captcha.failed', 'auth.otp.failed', 'auth.2fa.failed'] as const) {
      let last = true
      for (let i = 0; i < 51; i++) last = g.evaluate(type, `x${i}`, T0 + i).capture
      assert.equal(last, false, type)
    }
    let forbidden = false
    for (let i = 0; i < 100; i++) forbidden = g.evaluate('api.scope.denied', `t${i}`, T0 + i).capture
    assert.equal(forbidden, true)
  })

  test('alert text carries only a short target', () => {
    const g = createSecurityGate()
    const a = g.evaluate('api.scope.denied', '0123456789abcdef', T0).alert
    expect(a?.message).toContain('01234567')
    expect(a?.message).not.toContain('0123456789abcdef')
    expect(a?.message).toMatch(/See GlitchTip\.$/)
  })
  test('events without a target never trip a per-target rule, but still count globally', () => {
    const g = createSecurityGate()
    for (let i = 0; i < 20; i++) assert.equal(g.evaluate('auth.2fa.failed', undefined, T0 + i * 1000).alert, null)
    for (let i = 0; i < 20; i++) assert.equal(g.evaluate('auth.otp.failed', undefined, T0 + i * 1000).alert, null)
    // 20 untargeted + 479 distinct targets = 499 stays silent; the 500th trips the global spray rule.
    for (let i = 0; i < 479; i++) assert.equal(g.evaluate('auth.otp.failed', `user${i}`, T0 + 20_000 + i).alert, null)
    assert.equal(g.evaluate('auth.otp.failed', 'user-last', T0 + 30_000).alert?.priority, 5)
  })

  test('action.invalid_input: a user fixing a form stays silent, 20 in 15 min alerts', () => {
    const g = createSecurityGate()
    for (let i = 0; i < 19; i++) assert.equal(g.evaluate('action.invalid_input', 'u1', T0 + i * MIN / 2).alert, null)
    assert.equal(g.evaluate('action.invalid_input', 'u1', T0 + 10 * MIN).alert?.title, 'Security: action.invalid_input')
  })

  test('authResponseEvent maps Better Auth captcha failures and 429s, nothing else', () => {
    assert.equal(authResponseEvent(429, undefined), 'auth.ratelimited')
    assert.equal(authResponseEvent(403, 'VERIFICATION_FAILED'), 'auth.captcha.failed')
    assert.equal(authResponseEvent(400, 'MISSING_RESPONSE'), 'auth.captcha.failed')
    assert.equal(authResponseEvent(400, 'INVALID_OTP'), null)
    assert.equal(authResponseEvent(403, 'Invalid origin'), null)
    assert.equal(authResponseEvent(200, undefined), null)
  })

  test('captcha failures and auth 429s never alert (stale Turnstile tokens, shared IPs)', () => {
    const g = createSecurityGate()
    for (let i = 0; i < 1000; i++) {
      assert.equal(g.evaluate('auth.captcha.failed', undefined, T0 + i).alert, null)
      assert.equal(g.evaluate('auth.ratelimited', undefined, T0 + i).alert, null)
    }
  })
})
