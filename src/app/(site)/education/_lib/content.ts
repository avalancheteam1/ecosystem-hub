import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import courses from '../_content/entrepreneur/courses.json'
import flashcards from '../_content/entrepreneur/flashcards.json'
import quizzes from '../_content/entrepreneur/quizzes.json'
import type { Course, Flashcard, Quiz } from './rules'

// Content lives in git (`_content/`), edited by PR. Structure + quizzes are bundled JSON;
// lesson bodies are read from disk (next.config.ts traces `_content` into the standalone build).
export const COURSES: Course[] = courses
export const QUIZZES: Record<string, Quiz> = quizzes
export const FLASHCARDS: Record<string, Flashcard[]> = flashcards

const CONTENT_DIR = path.join(process.cwd(), 'src/app/(site)/education/_content/entrepreneur')

/** Only call with slugs that `findLesson` resolved - they are joined into a file path. */
export function readLesson(course: string, module: string, lesson: string): Promise<string> {
  return readFile(path.join(CONTENT_DIR, course, module, `${lesson}.md`), 'utf8')
}
