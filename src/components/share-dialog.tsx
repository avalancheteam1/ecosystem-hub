'use client'

import { useState } from 'react'
import Link from 'next/link'
import { QrCode, Share2 } from 'lucide-react'
import { CopyButton } from '@/components/copy-button'
import { QrCodePanel } from '@/components/qr-code-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/**
 * "Invite a friend": the page link (with the viewer's ?ref= code when they have
 * one), copy, native share where the browser has it, and a downloadable QR.
 */
export function ShareDialog({ url, title, filename, referred, signedIn }: {
  url: string
  /** Shown as the share sheet's title. */
  title: string
  /** QR download base name. */
  filename: string
  /** true when `url` carries the viewer's referral code. */
  referred: boolean
  signedIn: boolean
}) {
  const [showQr, setShowQr] = useState(false)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  return (
    <Dialog onOpenChange={(o) => { if (!o) setShowQr(false) }}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline"><Share2 aria-hidden /> Invite a friend</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a friend</DialogTitle>
          <DialogDescription>
            {referred
              ? 'Your referral code is in this link — everyone who signs up through it counts as your onboarding.'
              : signedIn
                ? <>Your referral codes are all deactivated — <Link href="/referrals" className="underline underline-offset-4 hover:text-fg-heading">activate one</Link> to get credit for friends who join.</>
                : <><Link href={`/sign-in?next=${encodeURIComponent(new URL(url).pathname)}`} className="underline underline-offset-4 hover:text-fg-heading">Sign in</Link> to add your referral code and get credit for friends who join.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={url} aria-label="Link" onFocus={(e) => e.currentTarget.select()} />
          <CopyButton value={url} label="Copy link" size="icon" variant="outline" />
        </div>
        <div className="flex flex-wrap gap-2">
          {canShare && (
            <Button variant="outline" onClick={() => navigator.share({ title, url }).catch(() => {})}><Share2 aria-hidden /> Share…</Button>
          )}
          {!showQr && <Button variant="outline" onClick={() => setShowQr(true)}><QrCode aria-hidden /> QR code</Button>}
        </div>
        {showQr && <QrCodePanel value={url} filename={filename} />}
      </DialogContent>
    </Dialog>
  )
}
