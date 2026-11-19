'use client'

import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'
import { setBountyPublication } from '@/app/(site)/earn/_lib/actions'

export function PublicationButton({ id, revision, published }: { id: string; revision: number; published: boolean }) {
  const { pending, run } = useActionToast()
  const label = published ? 'Unpublish bounty' : 'Publish bounty'
  return (
    <FormDialog
      trigger={<Button variant={published ? 'outline' : 'default'}>{label}</Button>}
      title={label}
      description={published
        ? 'The bounty will become a draft and its public link will return 404. You can edit it and publish again.'
        : 'The brief, instructions and any links will be visible to everyone. Confirm the deadline, reward and public links before publishing.'}
      submitLabel={published ? 'Unpublish' : 'Publish'}
      pending={pending}
      onSubmit={() => run(() => setBountyPublication({ id, revision, publish: !published }), published ? 'Bounty unpublished' : 'Bounty published')}
    >
      {null}
    </FormDialog>
  )
}
