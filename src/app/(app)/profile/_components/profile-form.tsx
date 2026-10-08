'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChipToggle } from '@/components/chip-toggle'
import { Field } from '@/components/field'
import { ImageUploadField } from '@/components/image-upload-field'
import { TagInput, ValueListInput } from '@/components/list-inputs'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { BUILDER_ROLES, EMPLOYMENT_ROLES, SKILL_SUGGESTIONS, type ProfileFormValues } from '@/lib/profile'
import { saveProfile } from '../_lib/actions'

function Prefixed({ prefix, ...props }: React.ComponentProps<typeof Input> & { prefix: string }) {
  return (
    <div className="flex h-11 items-center overflow-hidden rounded-lg border border-input focus-within:border-ring">
      <span className="border-r border-line bg-surface-1 px-3 text-sm text-fg-faint">{prefix}</span>
      <input {...props} className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" />
    </div>
  )
}

// `countries` comes from the server: Intl country names differ between Node and browsers (hydration).
export function ProfileForm({ userId, initial, next, countries }: { userId: string; initial: ProfileFormValues; next: string | null; countries: { code: string; name: string }[] }) {
  const router = useRouter()
  const [p, setP] = useState(initial)
  const set = <K extends keyof ProfileFormValues>(k: K, v: ProfileFormValues[K]) => setP((x) => ({ ...x, [k]: v }))
  const roles = p.builderRoles as string[]
  const { pending, run } = useActionToast()
  return (
    <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); run(() => saveProfile(p), 'Profile saved', () => next && router.push(next)) }}>
      <SectionCard title="About you">
        <div className="grid gap-6">
          <ImageUploadField kind="avatar" ownerId={userId} value={p.image ?? null} onChange={(v) => set('image', v)} label="Profile picture" />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="p-name" label="Full name" hint="Shown across the hub."><Input id="p-name" required value={p.name} onChange={(e) => set('name', e.target.value)} maxLength={80} className="h-11" /></Field>
            <Field id="p-user" label="Username"><Prefixed id="p-user" prefix="@" value={p.username ?? ''} onChange={(e) => set('username', e.target.value)} placeholder="username" maxLength={30} /></Field>
          </div>
          <Field id="p-bio" label="Short bio" hint="A sentence or two about what you build.">
            <Textarea id="p-bio" value={p.bio ?? ''} onChange={(e) => set('bio', e.target.value)} maxLength={250} rows={3} placeholder="Building education programs for Avalanche L1s." />
            <div className="flex justify-end text-xs text-fg-faint tabular-nums">{(p.bio ?? '').length}/250</div>
          </Field>
          <Field id="p-country" label="Country" hint="Helps match you with local programs and events.">
            <NativeSelect id="p-country" value={p.country ?? ''} onChange={(e) => set('country', e.target.value)}>
              <option value="">Select your country</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <fieldset className="space-y-3">
            <legend className="text-sm">What roles describe you?</legend>
            <ChipToggle label="Roles" options={BUILDER_ROLES.map((r) => ({ value: r.id, label: r.name }))} value={roles} onChange={(v) => set('builderRoles', v as ProfileFormValues['builderRoles'])} />
            <div className="grid gap-4 sm:grid-cols-2">
              {roles.includes('university') && <Field id="p-inst" label="Institution name"><Input id="p-inst" value={p.institution ?? ''} onChange={(e) => set('institution', e.target.value)} className="h-11" /></Field>}
              {(roles.includes('founder') || roles.includes('employee')) && <Field id="p-company" label="Company name"><Input id="p-company" value={p.companyName ?? ''} onChange={(e) => set('companyName', e.target.value)} className="h-11" /></Field>}
              {roles.includes('employee') && (
                <Field id="p-erole" label="Role">
                  <NativeSelect id="p-erole" value={p.employeeRole ?? ''} onChange={(e) => set('employeeRole', e.target.value as ProfileFormValues['employeeRole'])}>
                    <option value="">Select a role…</option>
                    {EMPLOYMENT_ROLES.map((r) => <option key={r}>{r}</option>)}
                  </NativeSelect>
                </Field>
              )}
            </div>
          </fieldset>
          <Field id="p-skills" label="Skills & expertise">
            <TagInput id="p-skills" value={p.skills as string[]} onChange={(v) => set('skills', v)} suggestions={SKILL_SUGGESTIONS} placeholder="Add skill" max={30} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Socials & wallets">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="p-gh" label="GitHub"><Prefixed id="p-gh" prefix="github.com/" value={p.githubAccount ?? ''} onChange={(e) => set('githubAccount', e.target.value)} placeholder="username" /></Field>
          <Field id="p-x" label="X"><Prefixed id="p-x" prefix="x.com/" value={p.xAccount ?? ''} onChange={(e) => set('xAccount', e.target.value)} placeholder="handle" /></Field>
          <Field id="p-tg" label="Telegram"><Prefixed id="p-tg" prefix="@" value={p.telegramAccount ?? ''} onChange={(e) => set('telegramAccount', e.target.value)} placeholder="username" /></Field>
          <Field id="p-li" label="LinkedIn"><Input id="p-li" type="url" value={p.linkedinAccount ?? ''} onChange={(e) => set('linkedinAccount', e.target.value)} placeholder="https://www.linkedin.com/in/username" className="h-11" /></Field>
          <Field id="p-other" label="Other socials" hint="Personal site or other links."><ValueListInput id="p-other" value={p.otherSocials as string[]} onChange={(v) => set('otherSocials', v)} placeholder="https://…" max={5} /></Field>
          <Field id="p-wallet" label="Wallets" hint="EVM addresses — the first one is your primary (used for rewards)."><ValueListInput id="p-wallet" type="text" value={p.wallets as string[]} onChange={(v) => set('wallets', v)} placeholder="0x…" max={5} /></Field>
        </div>
      </SectionCard>

      <SectionCard title="Updates">
        <div className="space-y-4 text-sm">
          <label className="flex items-start gap-3">
            <Checkbox className="mt-0.5" checked={p.newsletterOptIn} onCheckedChange={(c) => set('newsletterOptIn', c === true)} />
            <span><span className="text-fg-heading">Receive Avalanche news and updates</span><span className="block text-fg-muted">Newsletters and announcements. You can opt out anytime.</span></span>
          </label>
        </div>
      </SectionCard>

      <div><Button type="submit" disabled={pending}>Save profile</Button></div>
    </form>
  )
}
