import { Markdown } from '@/components/markdown'
import type { Flashcard, Quiz as QuizData } from '../_lib/rules'
import { splitLesson } from '../_lib/rules'
import { Flashcards } from './flashcards'
import { Quiz } from './quiz'

/** Markdown with the lesson directives swapped for their widgets. Only the one quiz/card set reaches the client, not the whole JSON. */
export function LessonBody({ body, quizzes, flashcards }: { body: string; quizzes: Record<string, QuizData>; flashcards: Record<string, Flashcard[]> }) {
  return splitLesson(body).map((s, i) => {
    if (s.kind === 'md') return <Markdown key={i} className="lesson-prose">{s.text}</Markdown>
    if (s.kind === 'quiz') return <Quiz key={i} id={s.id} quiz={quizzes[s.id]} />
    if (s.kind === 'flashcards') return <Flashcards key={i} cards={flashcards[s.id]} />
    return (
      <div key={i} className="my-10 aspect-video max-w-[72ch] overflow-hidden rounded-xl border border-line bg-surface-1 shadow-[0_8px_40px_-12px_rgb(0_0_0/0.5)]">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.id)}?rel=0`}
          title="YouTube video"
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="size-full"
        />
      </div>
    )
  })
}
