'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChipToggle } from '@/components/chip-toggle'
import { CountrySelect } from '@/components/country-select'
import { Field } from '@/components/field'
import { ImageUploadField } from '@/components/image-upload-field'
import { MarkdownField } from '@/components/markdown-field'
import { SocialLinksInput, TaggedLinksInput, TagInput, ValueListInput } from '@/components/list-inputs'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { createProject, saveProject } from '../_lib/actions'
import { CircleCheck, CircleDashed } from 'lucide-react'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { DEFAULT_NETWORK, PROJECT_NETWORKS, type ProjectNetwork } from '@/lib/project-networks'
import { MilestoneList, type Milestone } from './milestones'
import { missingForSubmission, PROJECT_CATEGORIES, TECH_STACK_DEFAULTS } from '../_lib/rules'
import type { ProjectFields } from '../_lib/schemas'

// Field set and copy from builders-hub's project submission (battle-tested).

const EMPTY: ProjectFields = {
  name: '', shortDescription: '', fullDescription: '', techDescription: '', techStack: [], categories: [], otherCategory: null, maturity: null as unknown as ProjectFields['maturity'], // must be picked
  launchDate: null,
  country: null,
  githubRepos: [], demoLinks: [], videoUrl: null, logoUrl: null, coverUrl: null, screenshots: [], deployedAddresses: [], websiteUrl: null, websites: [], socials: [],
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={`text-xs tabular-nums ${value.length > max ? 'text-destructive' : 'text-fg-faint'}`}>{value.length}/{max}</span>
}

const BASICS = ['Project name', 'Short description', 'Project stage'] as const
// Stage is also in missingForSubmission (old versions lack it); here it's a basic, required to save.
const FOR_SUBMISSION = ['Full description', 'How it’s made', 'Tech stack', 'Code repository', 'Website or demo link'] as const

function Checklist({ title, items, missing }: { title: string; items: readonly string[]; missing: string[] }) {
  return (
    <div>
      <p className="text-sm text-fg-heading">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((n) => {
          const done = !missing.includes(n)
          return (
            <li key={n} className={`flex items-center gap-1.5 ${done ? 'text-success' : 'text-fg-muted'}`}>
              {done ? <CircleCheck className="size-4 shrink-0" aria-hidden /> : <CircleDashed className="size-4 shrink-0" aria-hidden />} {n}
              <span className="sr-only">{done ? '(done)' : '(missing)'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Live checklist: basics (required to save) + what hackathon / grant submissions require (builders-hub's "complete" set). */
function SubmissionReadiness({ f, forGrant }: { f: ProjectFields; forGrant: boolean }) {
  const missing = [...(f.name.trim() ? [] : ['Project name']), ...(f.shortDescription.trim() ? [] : ['Short description']), ...missingForSubmission(f)]
  return (
    <section aria-label="What this project needs" className="grid gap-5 rounded-xl border border-line p-5">
      <Checklist title="Basic data - required to save" items={BASICS} missing={missing} />
      <Checklist title="Required for Hub submissions" items={FOR_SUBMISSION} missing={missing} />
      {forGrant && <p className="text-xs text-fg-muted">Mini Grants applications outside a round require a working demo link.</p>}
      <p className="text-xs text-fg-muted">You can save the project with the fields marked “required to save”.</p>
    </section>
  )
}

/**
 * `next`: where to go after saving (e.g. back to a hackathon submission).
 * `onSaved`: embedded use (dialog) - called instead of navigating.
 * `countries` comes from the server (Intl names differ between Node and browsers); `defaultCountry` prefills a new project (the creator's profile country).
 */
export function ProjectForm({ projectId, initial, next, selectProject, onSaved, onCancel, countries, defaultCountry }: { projectId?: string; initial?: ProjectFields; next?: string | null; selectProject?: boolean; onSaved?: (p: { id: string; slug: string }) => void; onCancel?: () => void; countries: { code: string; name: string }[]; defaultCountry?: string | null }) {
  const router = useRouter()
  const [f, setF] = useState<ProjectFields>(initial ?? { ...EMPTY, country: defaultCountry ?? null })
  const [pending, start] = useTransition()
  const set = <K extends keyof ProjectFields>(k: K, v: ProjectFields[K]) => setF((p) => ({ ...p, [k]: v }))
  const owner = projectId ?? 'new'
  const forGrant = next?.startsWith('/grants/') ?? false
  // New projects only: milestones are created with the project; afterwards they're edited live on the project page.
  const [milestones, setMilestones] = useState<Milestone[]>([])

  const submit = () =>
    start(async () => {
      const res = projectId ? await saveProject({ projectId, fields: f }) : await createProject({ fields: f, milestones: milestones.map(({ id: _id, ...m }) => ({ ...m, description: m.description ?? '' })) })
      if (!res.ok) return void toast.error(res.error)
      if ('changed' in res.data && !res.data.changed) toast.info('No changes')
      else toast.success(projectId ? 'Saved' : 'Project created')
      if (onSaved) return void onSaved({ id: 'id' in res.data ? res.data.id : projectId!, slug: res.data.slug })
      if (next && selectProject && 'id' in res.data) {
        const target = new URL(next, window.location.origin)
        target.searchParams.set('project', res.data.id)
        router.push(target.pathname + target.search + target.hash)
      } else router.push(next ?? `/projects/${res.data.slug}`)
      router.refresh()
    })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {/* First in the DOM so it leads on mobile; right-hand sticky column from lg. Outside the <form>: the milestone dialogs have their own forms. */}
      <aside className="grid gap-6 lg:sticky lg:top-24 lg:order-last lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
        <SubmissionReadiness f={f} forGrant={forGrant} />
        {!projectId && (
          <section aria-labelledby="ms-heading" className="rounded-xl border border-line p-5">
            <h2 id="ms-heading" className="mb-3 text-sm text-fg-heading">Milestones</h2>
            <MilestoneList
              items={milestones}
              onSave={(m, id) => {
                setMilestones((list) => (id ? list.map((x) => (x.id === id ? { ...x, ...m } : x)) : [...list, { ...m, id: crypto.randomUUID() }]))
                return true
              }}
              onDelete={(id) => setMilestones((list) => list.filter((x) => x.id !== id))}
            />
          </section>
        )}
      </aside>
      <form className="grid min-w-0 gap-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <SectionCard title="Basics">
          <div className="grid gap-6">
            <div className="flex flex-wrap gap-6">
              <ImageUploadField kind="project-logo" ownerId={owner} value={f.logoUrl} onChange={(v) => set('logoUrl', v)} label="Project logo" />
            </div>
            <Field id="name" label="Project name" requirement="required to save">
              <Input id="name" value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={60} placeholder="Enter your project name" className="h-11" />
            </Field>
            <Field id="website" label="Website" hint="The project's main website - shown at the top of the project page.">
              <Input id="website" type="url" value={f.websiteUrl ?? ''} onChange={(e) => set('websiteUrl', e.target.value)} placeholder="https://yourproject.xyz" maxLength={500} className="h-11" />
            </Field>
            <Field id="short" label="Short description" requirement="required to save" hint="A short and engaging overview - shown on cards and to judges first.">
              <Textarea id="short" value={f.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} required maxLength={280} rows={2} />
              <div className="flex justify-end"><Counter value={f.shortDescription} max={280} /></div>
            </Field>
            <MarkdownField id="full" label="Full description (required for submission)" hint="The problem, how it works, what's built on Avalanche." value={f.fullDescription} onChange={(t) => set('fullDescription', t)} rows={10} maxLength={20_000} />
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="maturity" label="Project stage" requirement="required to save" hint={f.maturity ? PROJECT_MATURITY[f.maturity].hint : 'How far the project is - from idea to established with users.'}>
                <NativeSelect id="maturity" required value={f.maturity ?? ''} onChange={(e) => set('maturity', e.target.value as ProjectMaturity)}>
                  <option value="" disabled>Pick a stage</option>
                  {Object.entries(PROJECT_MATURITY).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </NativeSelect>
              </Field>
              <Field id="launch" label="Launch date" hint="When it went live (mainnet or public). Leave empty if it hasn't launched yet.">
                <Input id="launch" type="date" value={f.launchDate ?? ''} onChange={(e) => set('launchDate', e.target.value || null)} className="h-11" />
              </Field>
            </div>
            <Field id="country" label="Country" hint="Where the team is based.">
              <div className="max-w-sm"><CountrySelect id="country" value={f.country} onChange={(v) => set('country', v)} countries={countries} /></div>
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm">Categories</legend>
              <ChipToggle label="Categories" options={PROJECT_CATEGORIES.map((c) => ({ value: c, label: c }))} value={f.categories} onChange={(v) => set('categories', v as ProjectFields['categories'])} />
              {f.categories.includes('Other (Specify)') && (
                <Field id="other-category" label="Other category" requirement="required to save">
                  <Input id="other-category" value={f.otherCategory ?? ''} onChange={(e) => set('otherCategory', e.target.value)} placeholder="Enter your custom category" maxLength={60} className="h-11 max-w-sm" />
                </Field>
              )}
            </fieldset>
          </div>
        </SectionCard>

        <SectionCard title="How it's made">
          <div className="grid gap-6">
            <Field id="tech" label="Tech stack (required for submission)" hint="Pick the main languages, frameworks and tools.">
              <TagInput id="tech" value={f.techStack} onChange={(v) => set('techStack', v)} suggestions={TECH_STACK_DEFAULTS} placeholder="Add technology" maxLength={30} />
            </Field>
            <MarkdownField id="how" label="How it's made (required for submission)" hint='Describe the stack, APIs and integrations. Mention any innovative or "hacky" parts worth highlighting.' value={f.techDescription} onChange={(t) => set('techDescription', t)} rows={6} maxLength={10_000} />
            <Field id="repos" label="Code repositories (required for submission)" hint="Must be public. If design-only, link a Figma file.">
              <ValueListInput id="repos" value={f.githubRepos} onChange={(v) => set('githubRepos', v)} placeholder="https://github.com/user/repo" />
            </Field>
            <Field id="addr" label="Deployed contract addresses">
              <div className="space-y-2">
                {f.deployedAddresses.map((a, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <Input aria-label={`Address ${i + 1} tag`} placeholder="Tag" maxLength={40} value={a.tag} onChange={(e) => set('deployedAddresses', f.deployedAddresses.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))} className="h-11 w-32 shrink-0" />
                    <NativeSelect aria-label={`Address ${i + 1} network`} value={a.network ?? DEFAULT_NETWORK} onChange={(e) => set('deployedAddresses', f.deployedAddresses.map((x, j) => (j === i ? { ...x, network: e.target.value as ProjectNetwork } : x)))} className="w-40 shrink-0">
                      {Object.entries(PROJECT_NETWORKS).map(([k, n]) => <option key={k} value={k}>{n.label}</option>)}
                    </NativeSelect>
                    <Field id={`deployed-address-${i}`} label={`Address ${i + 1}`} requirement="required to save this entry" className="min-w-0 flex-1 basis-56">
                      <Input id={`deployed-address-${i}`} placeholder="0x…" maxLength={120} value={a.address} onChange={(e) => set('deployedAddresses', f.deployedAddresses.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))} className="h-11 font-mono text-xs" />
                    </Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => set('deployedAddresses', f.deployedAddresses.filter((_, j) => j !== i))}>Remove</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => set('deployedAddresses', [...f.deployedAddresses, { tag: '', address: '', network: DEFAULT_NETWORK }])}>Add address</Button>
              </div>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Demo & media">
          <div className="grid gap-6">
            <Field id="demo" label="Demo and other links"
              requirement={forGrant ? 'working demo link required for applications outside a round' : undefined}
              hint={forGrant
                ? 'Add a link to a working project or prototype for a Mini Grants application outside a round.'
                : 'For submission, provide either a demo link or the website above. YouTube and Loom go in the video field.'}>
              <ValueListInput id="demo" value={f.demoLinks} onChange={(v) => set('demoLinks', v)} placeholder="https://yoursite.com" />
            </Field>
            <Field id="video" label="Demo video" hint="YouTube, Loom or Vimeo. At least 720p, clear audio, no background music.">
              <Input id="video" type="url" value={f.videoUrl ?? ''} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://youtube.com/…" className="h-11" />
            </Field>
            <ImageUploadField kind="project-cover" ownerId={owner} value={f.coverUrl} onChange={(v) => set('coverUrl', v)} label="Cover image" />
            <fieldset className="space-y-3">
              <legend className="text-sm">Screenshots <span className="text-fg-faint">- up to 5</span></legend>
              <div className="flex flex-wrap gap-4">
                {f.screenshots.map((u, i) => (
                  <ImageUploadField key={u} kind="project-screenshot" ownerId={owner} value={u} label={`Screenshot ${i + 1}`} onChange={(v) => set('screenshots', v ? f.screenshots.map((x, j) => (j === i ? v : x)) : f.screenshots.filter((_, j) => j !== i))} />
                ))}
                {f.screenshots.length < 5 && <ImageUploadField kind="project-screenshot" ownerId={owner} value={null} label="Add screenshot" onChange={(v) => v && set('screenshots', [...f.screenshots, v])} />}
              </div>
            </fieldset>
          </div>
        </SectionCard>

        <SectionCard title="Website & socials">
          <div className="grid gap-6 lg:grid-cols-2">
            <TaggedLinksInput label="Other websites" value={f.websites} onChange={(v) => set('websites', v)} />
            <SocialLinksInput label="Socials" value={f.socials} onChange={(v) => set('socials', v)} />
          </div>
        </SectionCard>

        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>{projectId ? 'Save changes' : 'Create project'}</Button>
          <Button type="button" variant="ghost" onClick={() => (onCancel ? onCancel() : router.back())}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
