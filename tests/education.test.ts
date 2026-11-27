import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import entrepreneur from '@/app/(site)/education/_content/entrepreneur/academy.json'
import { allLessons, countDirectives, findLesson, formatWait, isCorrect, linkedInAddUrl, lessonKey, lessonKind, optionOrder, publicVariants, QUIZ_LOCK_MS, QUIZ_TRIES, quizLock, printableName, progressOf, quizVariant, splitLesson, visitsToSync, type Academy, type Quiz } from '@/app/(site)/education/_lib/rules'
import { parseLocalProgress } from '@/app/(site)/education/_lib/local-progress'
import { lessonRefSchema, localProgressSchema, quizAnswerSchema } from '@/app/(site)/education/_lib/schemas'

const DIR = 'src/app/(site)/education/_content'
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
// Every academy folder in _content/ - a new academy is checked without touching this file.
const ACADEMIES = readdirSync(DIR).map((slug) => ({ slug, academy: json(`${DIR}/${slug}/academy.json`) as Academy, quizzes: json(`${DIR}/${slug}/quizzes.json`) as Record<string, Quiz>, flashcards: json(`${DIR}/${slug}/flashcards.json`) }))

test('splitLesson cuts Markdown at directive lines only', () => {
  assert.deepEqual(splitLesson('# Hi\n\n::youtube[abc_-1]\n\ntext ::quiz[1] inline\n::quiz[940]\n::flashcards[pricing]'), [
    { kind: 'md', text: '# Hi\n\n' },
    { kind: 'youtube', id: 'abc_-1' },
    { kind: 'md', text: '\n\ntext ::quiz[1] inline\n' },
    { kind: 'quiz', id: '940' },
    { kind: 'flashcards', id: 'pricing' },
  ])
  assert.deepEqual(splitLesson('plain'), [{ kind: 'md', text: 'plain' }])
})

test('isCorrect: exact answer set, any order', () => {
  assert.equal(isCorrect([1], [1]), true)
  assert.equal(isCorrect([3, 0], [0, 3]), true)
  assert.equal(isCorrect([0], [0, 3]), false)
  assert.equal(isCorrect([0, 3, 1], [0, 3]), false)
  assert.equal(isCorrect([], [0]), false)
})

test('quizVariant cycles through the original and its alternates', () => {
  const q = (question: string) => ({ question, options: [], correctAnswers: [], hint: '', explanation: '' })
  const quiz: Quiz = { ...q('a'), alternates: [q('b'), q('c')] }
  assert.deepEqual([0, 1, 2, 3].map((i) => quizVariant(quiz, i).question), ['a', 'b', 'c', 'a'])
  assert.equal(quizVariant({ ...q('only'), alternates: [] }, 5).question, 'only')
})

test('optionOrder is a stable permutation per seed', () => {
  const o = optionOrder(4, '940:0')
  assert.deepEqual([...o].sort(), [0, 1, 2, 3])
  assert.deepEqual(optionOrder(4, '940:0'), o)
  // Different seeds don't all agree (otherwise the answer would sit in one slot everywhere).
  assert.ok(new Set(Object.keys(ACADEMIES[0].quizzes).map((id) => optionOrder(4, `${id}:0`).join())).size > 1)
})

test('findLesson walks the whole academy and rejects unknown slugs', () => {
  const all = allLessons(entrepreneur)
  assert.equal(all[0].href, '/education/entrepreneur/foundations-web3-venture/01-legal-foundations/01-introduction')
  const first = findLesson(entrepreneur, all[0].course.slug, all[0].module.slug, all[0].lesson.slug)!
  assert.equal(first.prev, null)
  assert.equal(first.next?.href, all[1].href)
  const last = all.at(-1)!
  assert.equal(findLesson(entrepreneur, last.course.slug, last.module.slug, last.lesson.slug)!.next, null)
  assert.equal(findLesson(entrepreneur, 'go-to-market', '..', 'meta'), null)
})

test('lessonKind: quiz > flashcards > video > reading', () => {
  assert.equal(lessonKind(countDirectives('::youtube[a]\n::quiz[1]')), 'quiz')
  assert.equal(lessonKind(countDirectives('::flashcards[s]')), 'flashcards')
  assert.equal(lessonKind(countDirectives('text\n::youtube[a]\n::youtube[b]')), 'video')
  assert.equal(lessonKind(countDirectives('just text')), 'reading')
})

test('entrepreneur academy: all 4 builders-hub courses and 113 lessons', () => {
  assert.deepEqual(entrepreneur.courses.map((c) => c.slug), ['foundations-web3-venture', 'go-to-market', 'web3-community-architect', 'fundraising-finance'])
  assert.equal(allLessons(entrepreneur).length, 113)
})

// Content integrity. builders-hub shipped quizzes detached from their lessons, deleted quizzes still referenced,
// and quizzes required for a certificate that nobody could answer - these tests fail the PR (pnpm test in CI) instead.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const unique = (items: string[], what: string) => assert.equal(new Set(items).size, items.length, `duplicate ${what}: ${items.filter((x, i) => items.indexOf(x) !== i)}`)
const mdFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mdFiles(`${dir}/${e.name}`) : e.name.endsWith('.md') ? [`${dir}/${e.name}`] : []))
const lessonFile = (href: string) => `${DIR}/${href.split('/').slice(2).join('/')}.md`

test('content: structure - unique url-safe slugs, no empty course or module, no lesson file outside academy.json', () => {
  for (const { slug, academy } of ACADEMIES) {
    assert.equal(academy.slug, slug, 'academy.json slug = folder name')
    unique(academy.courses.map((c) => c.slug), `course in ${slug}`)
    for (const c of academy.courses) {
      assert.match(c.slug, SLUG, `course ${c.slug}`)
      assert.ok(c.modules.length > 0, `${c.slug}: no modules`)
      unique(c.modules.map((m) => m.slug), `module in ${c.slug}`)
      for (const m of c.modules) {
        assert.match(m.slug, SLUG, `module ${c.slug}/${m.slug}`)
        assert.ok(m.lessons.length > 0, `${c.slug}/${m.slug}: no lessons (an empty course would be "complete" at once)`)
        unique(m.lessons.map((l) => l.slug), `lesson in ${c.slug}/${m.slug}`)
        for (const l of m.lessons) assert.match(l.slug, SLUG, `lesson ${c.slug}/${m.slug}/${l.slug}`)
      }
    }
    const listed = new Set(allLessons(academy).map((l) => lessonFile(l.href)))
    for (const f of mdFiles(`${DIR}/${slug}`)) assert.ok(listed.has(f), `${f} is not in academy.json - unreachable`)
  }
})

test('content: every lesson file exists, every directive resolves, every quiz is used, no raw HTML', () => {
  for (const { slug, academy, quizzes, flashcards } of ACADEMIES) {
    const usedQuizzes = new Set<string>()
    for (const { href } of allLessons(academy)) {
      const file = lessonFile(href)
      assert.ok(existsSync(file), file)
      const body = readFileSync(file, 'utf8')
      assert.doesNotMatch(body, /<[A-Za-z/][^>]*>/, file)
      for (const s of splitLesson(body)) {
        // Object.hasOwn, not `in`: "constructor" is `in` every object.
        if (s.kind === 'quiz') { assert.ok(Object.hasOwn(quizzes, s.id), `${file}: quiz ${s.id} does not exist`); usedQuizzes.add(s.id) }
        if (s.kind === 'flashcards') assert.ok(Object.hasOwn(flashcards, s.id), `${file}: flashcards ${s.id} do not exist`)
      }
    }
    const orphans = Object.keys(quizzes).filter((id) => !usedQuizzes.has(id))
    assert.deepEqual(orphans, [], `${slug}: quizzes in no lesson`)
  }
})

test('content: every quiz variant is answerable through the UI and the server', () => {
  for (const { slug, quizzes } of ACADEMIES) {
    for (const [id, quiz] of Object.entries(quizzes)) {
      const variants = [quiz, ...quiz.alternates]
      variants.forEach((v, attempt) => {
        const at = `${slug} quiz ${id} variant ${attempt}`
        assert.ok(v.question.trim() && v.explanation.trim(), `${at}: question and explanation`)
        assert.ok(v.options.length >= 2 && v.options.every((o) => o.trim()), `${at}: at least 2 non-empty options`)
        unique(v.options, `option in ${at}`)
        assert.ok(v.correctAnswers.length > 0, `${at}: no correct answer`)
        // The UI selects each option at most once - a duplicated index could never be matched.
        unique(v.correctAnswers.map(String), `correct answer in ${at}`)
        for (const a of v.correctAnswers) assert.ok(Number.isInteger(a) && a >= 0 && a < v.options.length, `${at}: answer ${a} is not an option`)
        // What the browser sends for the right answer must pass the server's schema and grading.
        const sent = { academy: slug, quizId: id, attempt, selected: v.correctAnswers }
        assert.ok(quizAnswerSchema.safeParse(sent).success, `${at}: rejected by quizAnswerSchema`)
        assert.ok(isCorrect(sent.selected, quizVariant(quiz, attempt).correctAnswers), `${at}: not graded correct`)
      })
    }
  }
})

test('content: every course can be completed - the path to a certificate is never blocked', () => {
  for (const { slug, academy, quizzes } of ACADEMIES) {
    for (const course of academy.courses) {
      const visited = new Set<string>()
      const passed = new Set<string>()
      const lessons = allLessons(academy).filter((l) => l.course === course).map((l) => {
        const ref = { academy: slug, course: l.course.slug, module: l.module.slug, lesson: l.lesson.slug }
        // Opening the lesson: the visit action's schema and lookup must resolve it to this very lesson.
        assert.ok(lessonRefSchema.safeParse(ref).success, `${l.href}: rejected by lessonRefSchema`)
        assert.equal(findLesson(academy, ref.course, ref.module, ref.lesson)?.href, l.href, `${l.href}: not reachable`)
        visited.add(lessonKey(l))
        const quizIds = countDirectives(readFileSync(lessonFile(l.href), 'utf8')).quizIds
        for (const q of quizIds) if (isCorrect(quizzes[q].correctAnswers, quizVariant(quizzes[q], 0).correctAnswers)) passed.add(q)
        return { key: lessonKey(l), href: l.href, quizIds }
      })
      const p = progressOf({ visited, passed, last: null }, lessons)
      assert.ok(p.total > 0 && p.complete, `${slug}/${course.slug}: ${p.done} of ${p.total} completable`)
    }
  }
})

test('countDirectives collects quiz ids in order', () => {
  assert.deepEqual(countDirectives('::quiz[3]\ntext\n::quiz[1]').quizIds, ['3', '1'])
})

test('progressOf: done needs the visit and every quiz; resume continues after the last lesson opened', () => {
  const L = (key: string, quizIds: string[] = []) => ({ key, href: `/${key}`, quizIds })
  const lessons = [L('a'), L('b', ['q1']), L('c'), L('d')]
  const p = (visited: string[], passed: string[], last: string | null) => ({ visited: new Set(visited), passed: new Set(passed), last })

  assert.deepEqual(progressOf(p([], [], null), lessons), { done: 0, total: 4, complete: false, started: false, resume: '/a' })
  // b visited but its quiz not passed: not done. Last opened c → continue at d, not back at b.
  assert.deepEqual(progressOf(p(['a', 'b', 'c'], [], 'c'), lessons), { done: 2, total: 4, complete: false, started: true, resume: '/d' })
  // Everything after the last lesson done → wrap to the first gap.
  assert.equal(progressOf(p(['a', 'b', 'c', 'd'], [], 'd'), lessons).resume, '/b')
  // Last opened lesson from another course (not in the list) → first gap.
  assert.equal(progressOf(p(['a'], [], 'elsewhere'), lessons).resume, '/b')
  assert.deepEqual(progressOf(p(['a', 'b', 'c', 'd'], ['q1'], 'b'), lessons), { done: 4, total: 4, complete: true, started: true, resume: null })
})

test('visitsToSync: known lessons only, clamped to now, never moves an account visit backwards', () => {
  const known = new Set(['a', 'b', 'c'])
  const existing = new Map([['b', new Date(500)], ['c', new Date(100)]])
  const out = visitsToSync({ a: 200, b: 300, c: 400, ghost: 1, '../x': 1 }, known, existing, 350)
  assert.deepEqual(out, [{ lesson: 'a', visitedAt: new Date(200) }, { lesson: 'c', visitedAt: new Date(350) }])
})

test('linkedInAddUrl: pre-fills the certification with team1 as issuer, UTC issue month and the verification link', () => {
  const url = new URL(linkedInAddUrl({ id: 'abc123', courseTitle: 'Foundations of a Web3 Venture & More', issuedAt: new Date('2026-12-31T23:30:00Z') }, 'https://hub.team1.network/education/certificates/abc123'))
  assert.equal(url.origin + url.pathname, 'https://www.linkedin.com/profile/add')
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    startTask: 'CERTIFICATION_NAME',
    name: 'Foundations of a Web3 Venture & More',
    organizationId: '111983994',
    issueYear: '2026',
    issueMonth: '12',
    certUrl: 'https://hub.team1.network/education/certificates/abc123',
    certId: 'abc123',
  })
})

test('printableName: Latin (incl. accents, Vietnamese) and Thai print, other scripts and emoji do not', () => {
  for (const n of ['Ana-María O’Brien', 'Nguyễn Văn Anh', 'Zoë Ç. Şahin', 'สมชาย ใจดี', 'J. R. R. Tolkien (Jr.)']) assert.ok(printableName(n), n)
  for (const n of ['Иван Петров', '王小明', 'محمد', 'Ana 🚀', 'Νίκος']) assert.ok(!printableName(n), n)
})

test('quizLock: 3 tries, locked until the time passes, then a fresh 3', () => {
  const now = new Date(1_000_000)
  assert.deepEqual(quizLock(null, now), { triesLeft: QUIZ_TRIES, waitMs: 0 })
  assert.deepEqual(quizLock({ tries: 2, lockedUntil: null }, now), { triesLeft: 1, waitMs: 0 })
  const until = new Date(now.getTime() + QUIZ_LOCK_MS)
  assert.deepEqual(quizLock({ tries: 0, lockedUntil: until }, now), { triesLeft: 0, waitMs: QUIZ_LOCK_MS })
  assert.deepEqual(quizLock({ tries: 0, lockedUntil: until }, until), { triesLeft: QUIZ_TRIES, waitMs: 0 }) // lock over
  assert.equal(QUIZ_LOCK_MS, 24 * 60 * 60 * 1000)
})

test('publicVariants: what the browser gets carries no answers, hints or explanations', () => {
  for (const quiz of ACADEMIES.flatMap((a) => Object.values(a.quizzes))) {
    const out = publicVariants(quiz)
    assert.equal(out.length, 1 + quiz.alternates.length)
    for (const v of out) assert.deepEqual(Object.keys(v).sort(), ['multi', 'options', 'question'])
  }
})

test('formatWait rounds up to the minute', () => {
  assert.equal(formatWait(QUIZ_LOCK_MS), '24 h 0 min')
  assert.equal(formatWait(61 * 60_000 + 1), '1 h 2 min')
  assert.equal(formatWait(1), '1 min')
})

test('parseLocalProgress matches localProgressSchema', () => {
  const many = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`k${i}`, i]))
  const cases: [unknown, boolean][] = [
    [{ visits: {} }, true],
    [{ visits: { 'a/b/c/d': 1700000000000, x: 0 } }, true],
    [{ visits: { a: 1 }, extra: true }, true],
    [null, false],
    ['x', false],
    [{}, false],
    [{ visits: [] }, false],
    [{ visits: { a: '1' } }, false],
    [{ visits: { a: 1.5 } }, false],
    [{ visits: { a: -1 } }, false],
    [{ visits: { ['k'.repeat(401)]: 1 } }, false],
    [{ visits: many }, false],
  ]
  for (const [input, ok] of cases) {
    assert.equal(parseLocalProgress(input) !== null, ok, JSON.stringify(input).slice(0, 60))
    assert.equal(localProgressSchema.safeParse(input).success, ok, `schema: ${JSON.stringify(input).slice(0, 60)}`)
  }
  assert.deepEqual(parseLocalProgress({ visits: { a: 1 }, extra: true }), { visits: { a: 1 } })
})
