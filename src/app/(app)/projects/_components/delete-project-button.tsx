'use client'

import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/confirm-button'
import { useActionToast } from '@/hooks/use-action-toast'
import { deleteProject } from '../_lib/actions'

export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter()
  const { pending, run } = useActionToast()
  return (
    <ConfirmButton disabled={pending} message={`Delete "${name}"? It disappears for the whole team. Past hackathon submissions keep their submitted version.`} onConfirm={() => run(() => deleteProject({ projectId }), 'Project deleted', () => router.push('/projects'))}>
      Delete project
    </ConfirmButton>
  )
}
