import 'server-only'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import entrepreneur from '../_content/entrepreneur/academy.json'
import entrepreneurFlashcards from '../_content/entrepreneur/flashcards.json'
import entrepreneurQuizzes from '../_content/entrepreneur/quizzes.json'
import { allLessons, countDirectives, type Academy, type Flashcard, type LessonCounts, type Quiz } from './rules'

// Content lives in git (`_content/<academy>/`), edited by PR. Structure + quizzes are bundled JSON;
// lesson bodies are read from disk (next.config.ts traces `_content` into the standalone build).
// Adding an academy: a new `_content/<slug>/` folder + one entry here, in display order.
type AcademyContent = Academy & { quizzes: Record<string, Quiz>; flashcards: Record<string, Flashcard[]> }

export const ACADEMIES: AcademyContent[] = [
  { ...entrepreneur, quizzes: entrepreneurQuizzes, flashcards: entrepreneurFlashcards },
]

export const getAcademy = (slug: string) => ACADEMIES.find((a) => a.slug === slug) ?? null

const CONTENT_DIR = path.join(process.cwd(), 'src/app/(site)/education/_content')

/** Only call with slugs that `findLesson` resolved - they are joined into a file path. */
export function readLesson(academy: string, course: string, module: string, lesson: string): Promise<string> {
  return readFile(path.join(CONTENT_DIR, academy, course, module, `${lesson}.md`), 'utf8')
}

const countsCache = new Map<string, Map<string, LessonCounts>>()

/** Videos/quizzes/flashcards per lesson href, counted once per server process (content only changes on deploy). */
export function lessonCounts(academy: Academy): Map<string, LessonCounts> {
  let counts = countsCache.get(academy.slug)
  if (!counts) {
    counts = new Map(allLessons(academy).map((l) => [l.href, countDirectives(readFileSync(path.join(CONTENT_DIR, academy.slug, l.course.slug, l.module.slug, `${l.lesson.slug}.md`), 'utf8'))]))
    countsCache.set(academy.slug, counts)
  }
  return counts
}

/** Totals for a set of lesson hrefs (a course, or a whole academy). */
export function sumCounts(counts: Map<string, LessonCounts>, hrefs: string[]) {
  return hrefs.reduce((t, h) => { const c = counts.get(h)!; return { lessons: t.lessons + 1, videos: t.videos + c.videos, quizzes: t.quizzes + c.quizzes } }, { lessons: 0, videos: 0, quizzes: 0 })
}
