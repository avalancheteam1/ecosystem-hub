'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { importEvent } from '@/app/(site)/events/_lib/actions'
import type { PortalEvent } from '@/app/(site)/events/_lib/portal'
import { EventCover } from '@/components/event-cover'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function ImportEventDialog({ portalEvents, portalError, importedIds }: { portalEvents: PortalEvent[]; portalError: string | null; importedIds: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  const doImport = (ref: string) => {
    setBusy(ref)
    start(async () => {
      const res = await importEvent({ ref })
      setBusy(null)
      if (!res.ok) return void toast.error(res.error)
      toast.success(res.data.created ? 'Event imported as draft' : 'Already imported — refreshed from Luma')
      setOpen(false)
      router.push(`/admin/events/${res.data.id}`)
    })
  }

  const imported = useMemo(() => new Set(importedIds), [importedIds])
  const filtered = portalEvents.filter((e) => {
    const t = q.trim().toLowerCase()
    return !t || [e.name, e.location.city, e.chapter?.name].some((v) => v?.toLowerCase().includes(t))
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus aria-hidden /> Add event</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add an event</DialogTitle>
          <DialogDescription>Events come from Luma. Details, date and cover stay in sync with Luma.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="link" className="min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="link">Luma link</TabsTrigger>
            <TabsTrigger value="portal">team1 events</TabsTrigger>
          </TabsList>
          <TabsContent value="link">
            <form className="space-y-3 pt-4" onSubmit={(e) => { e.preventDefault(); doImport(url) }}>
              <Label htmlFor="luma-url">Luma event link</Label>
              <Input id="luma-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://luma.com/abc123" required className="h-11" />
              <Button type="submit" disabled={!!busy} className="w-full">
                {busy === url && <Loader2 className="animate-spin" aria-hidden />} Import event
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="portal" className="min-h-0">
            {portalError ? (
              <p className="pt-4 text-sm text-destructive">Couldn&apos;t load the member portal: {portalError}</p>
            ) : (
              <div className="space-y-3 pt-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city or chapter" aria-label="Search team1 events" className="h-11 pl-9" />
                </div>
                <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
                  {filtered.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 p-3">
                      <EventCover src={e.coverUrl} className="size-12 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg-heading">{e.name}</p>
                        <p className="truncate text-xs text-fg-muted">
                          {new Date(e.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {e.location.city ? ` in ${e.location.city}` : ''}
                          {e.chapter ? ` — ${e.chapter.name}` : ''}
                        </p>
                      </div>
                      {imported.has(e.id) ? (
                        <span className="text-xs text-fg-faint">Imported</span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={!!busy || !e.url} onClick={() => e.url && doImport(e.url)}>
                          {busy === e.url ? <Loader2 className="animate-spin" aria-hidden /> : 'Import'}
                        </Button>
                      )}
                    </li>
                  ))}
                  {filtered.length === 0 && <li className="p-6 text-center text-sm text-fg-muted">No upcoming team1 events match.</li>}
                </ul>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
