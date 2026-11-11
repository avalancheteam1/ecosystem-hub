import { test } from 'vitest'
import assert from 'node:assert/strict'
import { DATA_COLLECTION, safeErrorMessage, scrubEvent, scrubText } from '@/lib/sentry-scrub'

test('drops cookies and auth headers', () => {
  const e = scrubEvent({ request: { url: 'https://hub/events', cookies: { a: '1' }, headers: { cookie: 'a=1', authorization: 'Bearer x', Authorization: 'Bearer y', 'user-agent': 'ua' } } })
  assert.deepEqual(e.request, { url: 'https://hub/events', headers: { 'user-agent': 'ua' } })
})

test('strips query strings from every URL', () => {
  const url = (u: string) => scrubEvent({ request: { url: u, query_string: 'x=1' } }).request
  assert.deepEqual(url('https://hub/sign-in?next=/x&email=a@x.io'), { url: 'https://hub/sign-in' })
  assert.deepEqual(url('https://hub/api/auth/callback/github?code=c&state=s'), { url: 'https://hub/api/auth/callback/github' })
  assert.deepEqual(url('https://hub/events/x/join?invite=abc#y'), { url: 'https://hub/events/x/join' })
  const crumbs = scrubEvent({ breadcrumbs: [{ data: { from: '/sign-in?email=a@x.io', to: '/events/x/join?invite=abc', url: 'https://hub/api/auth/x?t=1' } }] }).breadcrumbs
  assert.deepEqual(crumbs, [{ data: { from: '/sign-in', to: '/events/x/join', url: 'https://hub/api/auth/x' } }])
})

test('replaces project invite tokens in paths everywhere', () => {
  const tok = 'Zk3_q9-AbCdEf'
  const e = scrubEvent({
    request: { url: `https://hub/projects/invite/${tok}` },
    transaction: `/projects/invite/${tok}`,
    contexts: { nextjs: { request_path: `/projects/invite/${tok}?x=1` } },
    breadcrumbs: [{ message: `nav to /projects/invite/${tok}`, data: { from: '/dashboard', to: `/projects/invite/${tok}/` } }],
    exception: { values: [{ type: 'Error', value: `failed loading https://hub/projects/invite/${tok}` }] },
  })
  assert.ok(!JSON.stringify(e).includes(tok))
  assert.equal(e.request?.url, 'https://hub/projects/invite/[token]')
  assert.equal(e.contexts?.nextjs?.request_path, '/projects/invite/[token]')
  assert.equal(e.breadcrumbs?.[0]?.data?.to, '/projects/invite/[token]/')
})

test('masks emails in exception text and messages', () => {
  const e = scrubEvent({
    message: 'mail to a.b+c@uni.example.edu failed',
    exception: { values: [{ type: 'Error', value: "Can't send mail - all recipients were rejected: 550 5.1.1 <jane.doe@gmail.com>: Recipient address rejected" }] },
    breadcrumbs: [{ message: 'console: bob@x.io' }],
  })
  assert.equal(e.message, 'mail to [email] failed')
  assert.equal(e.exception?.values?.[0]?.value, "Can't send mail - all recipients were rejected: 550 5.1.1 <[email]>: Recipient address rejected")
  assert.equal(e.breadcrumbs?.[0]?.message, 'console: [email]')
})

test('shortens Prisma messages to the line without query values', () => {
  const value = '\nInvalid `prisma.user.update()` invocation in\n/app/src/lib/x.ts:12:3\n\n  prisma.user.update({\n    where: { id: "u1" },\n    data: { name: "Jane Doe", email: "jane@x.io", age: "x" }\n  })\n\nArgument `age`: Invalid value provided. Expected Int, provided String.'
  const e = scrubEvent({ exception: { values: [{ type: 'PrismaClientValidationError', value }] } })
  assert.equal(e.exception?.values?.[0]?.value, 'Argument `age`: Invalid value provided. Expected Int, provided String.')
})

test('scrubText leaves ordinary text alone', () => {
  assert.equal(scrubText('P2002 Unique constraint failed on the fields: (`email`)'), 'P2002 Unique constraint failed on the fields: (`email`)')
  assert.equal(scrubText('/projects/my-project/edit'), '/projects/my-project/edit')
  const frame = 'at /app/node_modules/.pnpm/next@16.4.5_@babel+core@7.29.7_react@19.2.0/node_modules/next/dist/x.js:1:2'
  assert.equal(scrubText(frame), frame)
})

test('reduces user to id', () => {
  assert.deepEqual(scrubEvent({ user: { id: 'u1', email: 'a@x.io', ip_address: '1.2.3.4' } }).user, { id: 'u1' })
  assert.equal(scrubEvent({ user: { email: 'a@x.io' } }).user, undefined)
})

test('strips the query from the Next.js request path', () => {
  const e = scrubEvent({ contexts: { nextjs: { request_path: '/events/x/join?invite=abc', router_kind: 'App Router' } } })
  assert.deepEqual(e.contexts, { nextjs: { request_path: '/events/x/join', router_kind: 'App Router' } })
})

test('the SDK collects no URL query params', () => {
  assert.equal(DATA_COLLECTION.urlQueryParams, false)
})

test('scrubs extra, tags, console breadcrumb arguments and drops the request body', () => {
  const e = scrubEvent({
    request: { url: 'https://hub/x', data: { email: 'a@x.io' } },
    extra: { reason: 'mail to bob@x.io failed', nested: { list: ['c@x.io'] }, n: 1 },
    tags: { who: 'd@x.io' },
    breadcrumbs: [{ data: { arguments: ['failed for e@x.io'], logger: 'console' } }],
  })
  assert.deepEqual(e.request, { url: 'https://hub/x' })
  assert.deepEqual(e.extra, { reason: 'mail to [email] failed', nested: { list: ['[email]'] }, n: 1 })
  assert.deepEqual(e.tags, { who: '[email]' })
  assert.deepEqual(e.breadcrumbs?.[0]?.data, { arguments: ['failed for [email]'], logger: 'console' })
})

test('safeErrorMessage masks emails and shortens Prisma messages', () => {
  assert.equal(safeErrorMessage(new Error('550 <jane@x.io> rejected')), '550 <[email]> rejected')
  const prisma = Object.assign(new Error("Invalid `prisma.user.create()`\n  data: { email: 'a@x.io' }\n\nUnique constraint failed"), { name: 'PrismaClientKnownRequestError' })
  assert.equal(safeErrorMessage(prisma), 'Unique constraint failed')
  assert.equal(safeErrorMessage('plain a@x.io'), 'plain [email]')
})

test('keeps only allow-listed request headers', () => {
  const e = scrubEvent({ request: { headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.9', referer: 'https://hub/sign-in?email=a@x.io', 'x-pathname': '/a?b=1', Accept: '*/*', 'content-type': 'text/plain' } } })
  assert.deepEqual(e.request?.headers, { Accept: '*/*', 'content-type': 'text/plain' })
})
