'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateProfile } from '../_lib/actions'

export function ProfileForm({ name: initial }: { name: string }) {
  const [name, setName] = useState(initial)
  const [pending, start] = useTransition()
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await updateProfile({ name })
          if (res.ok) toast.success('Name saved')
          else toast.error(res.error)
        })
      }}
    >
      <div className="flex-1 space-y-2">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="h-11" />
      </div>
      <Button type="submit" className="self-start" disabled={pending || name.trim() === initial}>Save name</Button>
    </form>
  )
}
