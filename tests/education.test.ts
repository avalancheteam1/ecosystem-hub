import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import entrepreneur from '@/app/(site)/education/_content/entrepreneur/academy.json'
import { allLessons, countDirectives, findLesson, isCorrect, lessonKind, optionOrder, quizVariant, splitLesson, type Academy, type Quiz } from '@/app/(site)/education/_lib/rules'

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

test('content: per academy, every lesson file exists, every directive resolves, no raw HTML', () => {
  for (const { slug, academy, quizzes, flashcards } of ACADEMIES) {
    assert.equal(academy.slug, slug, 'academy.json slug = folder name')
    const usedQuizzes = new Set<string>()
    for (const { href } of allLessons(academy)) {
      const file = `${DIR}/${href.split('/').slice(2).join('/')}.md`
      assert.ok(existsSync(file), file)
      const body = readFileSync(file, 'utf8')
      assert.doesNotMatch(body, /<[A-Za-z/][^>]*>/, file)
      for (const s of splitLesson(body)) {
        if (s.kind === 'quiz') { assert.ok(s.id in quizzes, `${file}: quiz ${s.id}`); usedQuizzes.add(s.id) }
        if (s.kind === 'flashcards') assert.ok(s.id in flashcards, `${file}: flashcards ${s.id}`)
      }
    }
    assert.equal(usedQuizzes.size, Object.keys(quizzes).length, `${slug}: orphaned quizzes`)
  }
})

test('content: every quiz answer points at an existing option', () => {
  for (const [id, quiz] of ACADEMIES.flatMap((a) => Object.entries(a.quizzes))) {
    for (const v of [quiz, ...quiz.alternates]) {
      assert.ok(v.correctAnswers.length > 0, id)
      for (const a of v.correctAnswers) assert.ok(a >= 0 && a < v.options.length, `quiz ${id}: answer ${a}`)
    }
  }
})
