import { Markdown } from '@/components/markdown'
import { FLASHCARDS, QUIZZES } from '../_lib/content'
import { splitLesson } from '../_lib/rules'
import { Flashcards } from './flashcards'
import { Quiz } from './quiz'

/** Markdown with the lesson directives swapped for their widgets. Only the one quiz/card set reaches the client, not the whole JSON. */
export function LessonBody({ body }: { body: string }) {
  return splitLesson(body).map((s, i) => {
    if (s.kind === 'md') return <Markdown key={i}>{s.text}</Markdown>
    if (s.kind === 'quiz') return <Quiz key={i} id={s.id} quiz={QUIZZES[s.id]} />
    if (s.kind === 'flashcards') return <Flashcards key={i} cards={FLASHCARDS[s.id]} />
    return (
      <div key={i} className="my-8 aspect-video max-w-[72ch] overflow-hidden rounded-xl border border-line bg-surface-1">
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
