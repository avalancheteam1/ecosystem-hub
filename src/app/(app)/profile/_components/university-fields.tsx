'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ChipToggle } from '@/components/chip-toggle'
import { CountrySelect } from '@/components/country-select'
import { Field } from '@/components/field'
import { SearchSelect } from '@/components/search-select'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { CATALOG_VALUE, catalogSearchWords, emptyUniversityEntry, FIELDS_OF_STUDY, graduationYearRange, MAX_UNIVERSITIES, needsAdultConfirmation, TRACK_INTERESTS, UNIVERSITY_KINDS, updateUniversityEntry, type universityGaps, type UniversityEntry, type UniversityHit, type UniversityKind } from '@/lib/campus'
import { flagEmoji } from '@/lib/countries'
import { searchUniversities } from '@/lib/organization-actions'
import type { OrgOptions } from '@/lib/organizations'
import type { ProfileFormValues } from '@/lib/profile'

type CampusValues = Pick<ProfileFormValues, 'universities' | 'trackInterests' | 'campusCoordinatorInterest' | 'adultConfirmed'>

const OTHER = '__other'

/** The University role's part of the profile: one row per university, then the student-only questions. */
export function UniversityFields({ p, set, orgs, legacyInstitution, countries, defaultCountry, gaps, showErrors, children }: {
  p: CampusValues
  set: <K extends keyof ProfileFormValues>(k: K, v: ProfileFormValues[K]) => void
  orgs: OrgOptions
  /** The free-text institution from before campus - shown as a hint on the first row until a university is picked. */
  legacyInstitution: string | null
  countries: { code: string; name: string }[]
  defaultCountry: string | null
  gaps: ReturnType<typeof universityGaps>
  showErrors: boolean
  /** Extra student-only fields (the onboarding step asks for Telegram here). */
  children?: React.ReactNode
}) {
  // Per render, not per module: a long-lived server would keep last year's range.
  const years = graduationYearRange(new Date())
  const entries = p.universities
  const update = (i: number, patch: Partial<UniversityEntry>) => set('universities', entries.map((e, j) => (j === i ? updateUniversityEntry(e, patch) : e)))
  const error = (show: boolean, message: string) => showErrors && show && <p role="alert" className="text-xs text-destructive">{message}</p>
  const flag = (country: string | null) => (country ? <span aria-hidden>{flagEmoji(country)}</span> : undefined)
  // Universities are searched on the server as you type (same list for everybody); one picker is open at a time.
  const [query, setQuery] = useState('')
  // the hits with the query they answer: an older answer is never shown (or picked) for a newer query
  const [result, setResult] = useState<{ q: string; hits: UniversityHit[] }>({ q: '', hits: [] })
  // picked in this form, so their labels outlive the search
  const [picked, setPicked] = useState<UniversityHit[]>([])
  useEffect(() => {
    if (!catalogSearchWords(query).length) return
    let live = true
    const t = setTimeout(async () => {
      const r = await searchUniversities({ q: query.slice(0, 100) }) // the action rejects longer (a paste)
      if (live && r.ok) setResult({ q: query, hits: r.data })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [query])
  const hits = catalogSearchWords(query).length && result.q === query ? result.hits : []
  // saved + picked ones (cmdk filters them), then the server's hits (always shown); one option per value
  const universityOptions = [...new Map([
    ...orgs.universities.map((u) => ({ value: u.id, name: u.name, aliases: u.aliases, country: u.country })),
    ...picked,
    ...hits,
  ].map((h) => [h.value, { value: h.value, label: h.name, keywords: h.aliases, icon: flag(h.country), matched: hits.some((x) => x.value === h.value) }])).values()]
  const student = needsAdultConfirmation(entries)

  return (
    <SectionCard title="University" description="Where you study or work. Can't find yours? Type its name and add it.">
      <div id="p-campus" className="grid gap-6">
        {entries.map((e, i) => {
          const clubs = e.universityId ? orgs.clubs.filter((c) => c.parentId === e.universityId) : []
          const fieldIsOther = e.fieldOfStudy !== null && !(FIELDS_OF_STUDY as readonly string[]).includes(e.fieldOfStudy)
          return (
            <div key={i} className="grid gap-4 rounded-lg border border-line p-4">
              <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <Field id={`p-kind-${i}`} label="I am a">
                  <NativeSelect id={`p-kind-${i}`} value={e.kind} onChange={(ev) => update(i, { kind: ev.target.value as UniversityKind })}>
                    {UNIVERSITY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </NativeSelect>
                </Field>
                <Field id={`p-uni-${i}`} label="University" required hint={i === 0 && legacyInstitution && !e.universityId && !e.catalogUniversity && !e.newUniversity ? `You entered “${legacyInstitution}” before - search for it, or add it if it isn't listed.` : undefined}>
                  <SearchSelect
                    id={`p-uni-${i}`}
                    value={e.universityId ?? (e.catalogUniversity ? CATALOG_VALUE + e.catalogUniversity.rorId : null)}
                    label={e.newUniversity ? `${e.newUniversity.name} (new)` : (e.catalogUniversity?.name ?? null)}
                    options={universityOptions}
                    onSearchChange={setQuery}
                    placeholder="Search your university"
                    searchPlaceholder="Type a university name…"
                    emptyText="Type the name of your university." // while typing, "Add …" shows instead
                    onChange={(value) => {
                      const hit = hits.find((h) => h.value === value)
                      if (hit) setPicked((list) => [...list.filter((h) => h.value !== value), hit])
                      const catalog = value.startsWith(CATALOG_VALUE) ? { rorId: value.slice(CATALOG_VALUE.length), name: hit?.name ?? '' } : null
                      update(i, { universityId: catalog ? null : value, catalogUniversity: catalog, newUniversity: null, clubId: null, newClubName: null })
                    }}
                    onCreate={(name) => update(i, { universityId: null, catalogUniversity: null, newUniversity: { name, country: defaultCountry }, clubId: null, newClubName: null })}
                  />
                  {error(gaps.university[i]!, 'Pick your university')}
                </Field>
              </div>
              {e.newUniversity && (
                <Field id={`p-unicountry-${i}`} label="Country of the university" required hint="New universities are added to the list for everyone.">
                  <CountrySelect id={`p-unicountry-${i}`} value={e.newUniversity.country} onChange={(c) => update(i, { newUniversity: { ...e.newUniversity!, country: c } })} countries={countries} />
                  {error(gaps.country[i]!, "Pick the university's country")}
                </Field>
              )}
              {e.kind === 'student' && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id={`p-field-${i}`} label="Field of study" required>
                      <NativeSelect id={`p-field-${i}`} value={fieldIsOther ? OTHER : (e.fieldOfStudy ?? '')} onChange={(ev) => update(i, { fieldOfStudy: ev.target.value === OTHER ? '' : ev.target.value || null })}>
                        <option value="">Select…</option>
                        {FIELDS_OF_STUDY.map((f) => <option key={f}>{f}</option>)}
                        <option value={OTHER}>Other…</option>
                      </NativeSelect>
                      {fieldIsOther && <Input aria-label="Your field of study" value={e.fieldOfStudy ?? ''} onChange={(ev) => update(i, { fieldOfStudy: ev.target.value })} maxLength={80} placeholder="Your field of study" className="h-11" />}
                      {error(gaps.fieldOfStudy[i]!, 'Pick your field of study')}
                    </Field>
                    <Field id={`p-grad-${i}`} label="Graduation year">
                      <Input id={`p-grad-${i}`} type="number" inputMode="numeric" min={years.min} max={years.max} value={e.graduationYear ?? ''} onChange={(ev) => update(i, { graduationYear: ev.target.value ? Number(ev.target.value) : null })} placeholder={String(years.max - 7)} className="h-11" />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id={`p-club-${i}`} label="Blockchain club" hint={e.universityId || e.catalogUniversity || e.newUniversity ? 'If you are part of one.' : 'Pick your university first.'}>
                      <SearchSelect
                        id={`p-club-${i}`}
                        value={e.clubId ?? ''}
                        label={e.newClubName ? `${e.newClubName} (new)` : null}
                        options={[{ value: '', label: 'No club' }, ...clubs.map((c) => ({ value: c.id, label: c.name, keywords: c.aliases }))]}
                        searchPlaceholder="Type a club name…"
                        onChange={(id) => update(i, { clubId: id || null, newClubName: null })}
                        onCreate={e.universityId || e.catalogUniversity || e.newUniversity ? (name) => update(i, { clubId: null, newClubName: name }) : undefined}
                      />
                    </Field>
                    {(e.clubId || e.newClubName) && (
                      <Field id={`p-clubpos-${i}`} label="Your position in the club">
                        <Input id={`p-clubpos-${i}`} value={e.clubPosition ?? ''} onChange={(ev) => update(i, { clubPosition: ev.target.value })} maxLength={80} placeholder="Member, President, …" className="h-11" />
                      </Field>
                    )}
                  </div>
                </>
              )}
              {entries.length > 1 && (
                <div>
                  <Button type="button" variant="ghost" onClick={() => set('universities', entries.filter((_, j) => j !== i))}><Trash2 aria-hidden /> Remove</Button>
                </div>
              )}
            </div>
          )
        })}
        {error(gaps.none, 'Add your university')}
        {entries.length < MAX_UNIVERSITIES && (
          <div>
            <Button type="button" variant="outline" onClick={() => set('universities', [...entries, emptyUniversityEntry()])}><Plus aria-hidden /> {entries.length ? 'Add another university' : 'Add university'}</Button>
          </div>
        )}
        {student && (
          <>
            {children}
            <fieldset className="space-y-3">
              <legend className="text-sm">Which tracks interest you?</legend>
              <ChipToggle label="Tracks" options={TRACK_INTERESTS.map((t) => ({ value: t.id, label: t.label }))} value={p.trackInterests} onChange={(v) => set('trackInterests', v as CampusValues['trackInterests'])} />
            </fieldset>
            <div className="space-y-4 text-sm">
              <label className="flex items-start gap-3">
                <Checkbox className="mt-0.5" checked={p.campusCoordinatorInterest} onCheckedChange={(c) => set('campusCoordinatorInterest', c === true)} />
                <span><span className="text-fg-heading">I&apos;m interested in the Campus Coordinator program</span><span className="block text-fg-muted">Represent team1 at your university. We&apos;ll reach out with details.</span></span>
              </label>
              <label className="flex items-start gap-3">
                <Checkbox id="p-adult" className="mt-0.5" checked={p.adultConfirmed} onCheckedChange={(c) => set('adultConfirmed', c === true)} />
                <span className="text-fg-heading">I confirm that I am 18 or older <span aria-hidden className="text-destructive">*</span></span>
              </label>
              {error(gaps.adult, 'Confirm that you are 18 or older')}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
