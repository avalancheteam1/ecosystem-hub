// Pure, isomorphic rules for the education area (tested in tests/education.test.ts).

export type LessonMeta = { slug: string; title: string; description: string }
export type CourseModule = { slug: string; label: string; title: string; lessons: LessonMeta[] }
export type Course = { slug: string; title: string; description: string; intro: string; modules: CourseModule[] }
/** One academy = one folder in `_content/` (academy.json + quizzes.json + flashcards.json). */
export type Academy = { slug: string; title: string; tagline: string; description: string; courses: Course[] }

export type QuizQuestion = { question: string; options: string[]; correctAnswers: number[]; hint: string; explanation: string }
export type Quiz = QuizQuestion & { alternates: QuizQuestion[] }
export type Flashcard = { term: string; definition: string; example?: string }

/** A lesson body: Markdown with one-line directives `::youtube[id]`, `::quiz[id]`, `::flashcards[set]`. */
export type Segment = { kind: 'md'; text: string } | { kind: 'youtube' | 'quiz' | 'flashcards'; id: string }

export function splitLesson(body: string): Segment[] {
  const parts = body.split(/^::(youtube|quiz|flashcards)\[([^\]\n]+)\][ \t]*$/m)
  const out: Segment[] = []
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i].trim()) out.push({ kind: 'md', text: parts[i] })
    if (i + 2 < parts.length) out.push({ kind: parts[i + 1] as 'youtube' | 'quiz' | 'flashcards', id: parts[i + 2] })
  }
  return out
}

/** What a lesson holds - drives its icon. Counted from the body's directives. */
export type LessonCounts = { videos: number; quizzes: number; flashcards: number }
export type LessonKind = 'quiz' | 'flashcards' | 'video' | 'reading'

export function countDirectives(body: string): LessonCounts {
  const n = { videos: 0, quizzes: 0, flashcards: 0 }
  for (const s of splitLesson(body)) {
    if (s.kind === 'youtube') n.videos++
    if (s.kind === 'quiz') n.quizzes++
    if (s.kind === 'flashcards') n.flashcards++
  }
  return n
}

export function lessonKind(c: LessonCounts): LessonKind {
  return c.quizzes ? 'quiz' : c.flashcards ? 'flashcards' : c.videos ? 'video' : 'reading'
}

export const academyHref = (a: Academy) => `/education/${a.slug}`
export const courseHref = (a: Academy, c: Course) => `${academyHref(a)}/${c.slug}`

/** Lessons in reading order across all courses - prev/next walk through the whole academy. */
export function allLessons(academy: Academy) {
  return academy.courses.flatMap((course) =>
    course.modules.flatMap((module) => module.lessons.map((lesson) => ({ course, module, lesson, href: `${courseHref(academy, course)}/${module.slug}/${lesson.slug}` }))),
  )
}

export function findLesson(academy: Academy, course: string, module: string, lesson: string) {
  const all = allLessons(academy)
  const i = all.findIndex((r) => r.course.slug === course && r.module.slug === module && r.lesson.slug === lesson)
  if (i < 0) return null
  return { ...all[i], prev: all[i - 1] ?? null, next: all[i + 1] ?? null }
}

/** Multi-answer questions need exactly the right set; order doesn't matter. */
export function isCorrect(selected: number[], correct: number[]): boolean {
  return selected.length === correct.length && correct.every((c) => selected.includes(c))
}

/** Each retry shows the next phrasing (the original, then its alternates), cycling. */
export function quizVariant(quiz: Quiz, attempt: number): QuizQuestion {
  const all = [quiz, ...quiz.alternates]
  return all[attempt % all.length]
}

/** Option display order, shuffled but stable for a seed - server and client render the same order (no hydration mismatch). */
export function optionOrder(n: number, seed: string): number[] {
  let h = 2166136261 // FNV-1a → seed for a small LCG; good enough to not always put the answer in the same slot
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) | 0
    const j = (h >>> 0) % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}
