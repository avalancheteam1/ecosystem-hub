import { BookOpen, Layers, ListChecks, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LessonKind } from '../_lib/rules'

const ICON = { video: PlayCircle, flashcards: Layers, quiz: ListChecks, reading: BookOpen } as const
export const KIND_LABEL = { video: 'Video', flashcards: 'Flashcards', quiz: 'Quiz', reading: 'Reading' } as const

export function LessonIcon({ kind, className }: { kind: LessonKind; className?: string }) {
  const Icon = ICON[kind]
  return <Icon className={cn('size-4 shrink-0', kind === 'quiz' || kind === 'flashcards' ? 'text-brand' : 'text-fg-faint', className)} aria-label={KIND_LABEL[kind]} />
}
