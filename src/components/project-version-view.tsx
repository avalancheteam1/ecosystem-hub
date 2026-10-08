import { Code2, ExternalLink, Globe, PlayCircle } from 'lucide-react'
import type { ProjectVersion } from '@prisma/client'
import { Markdown } from '@/components/markdown'
import { Badge } from '@/components/ui/badge'
import { initials } from '@/lib/utils'

type Tagged = { tag: string; url: string }
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

function LinkButton({ href, icon: Icon, children }: { href: string; icon: typeof Code2; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer nofollow" className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-line px-4 text-sm transition-colors hover:border-brand">
      <Icon className="size-4 shrink-0" aria-hidden /> <span className="truncate">{children}</span>
    </a>
  )
}

/** Read-only rendering of one immutable project version (project page, submissions, judging). */
export function ProjectVersionView({ version: v }: { version: ProjectVersion }) {
  const websites = (v.websites as Tagged[]) ?? []
  const socials = (v.socials as Tagged[]) ?? []
  const addresses = (v.deployedAddresses as { tag: string; address: string }[]) ?? []
  const categories = v.categories.map((c) => (c === 'Other (Specify)' ? v.otherCategory : c)).filter(Boolean)
  return (
    <article className="space-y-8">
      {v.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
        <img src={v.coverUrl} alt="" className="aspect-video w-full rounded-xl border border-line object-cover" />
      )}
      <header className="flex items-start gap-5">
        {v.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
          <img src={v.logoUrl} alt="" className="size-16 shrink-0 rounded-2xl border border-line object-cover" />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-line bg-surface-1 text-xl text-brand">{initials(v.name)}</span>
        )}
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl">{v.name}</h2>
          <p className="mt-1 text-lg text-fg-muted">{v.shortDescription}</p>
          {categories.length > 0 && <p className="mt-2 text-sm text-fg-faint">{categories.join(' / ')}</p>}
        </div>
      </header>

      {(v.githubRepos.length > 0 || v.demoLinks.length > 0 || v.videoUrl) && (
        <div className="flex flex-wrap gap-2">
          {v.githubRepos.map((u) => <LinkButton key={u} href={u} icon={Code2}>{host(u) === 'github.com' ? new URL(u).pathname.slice(1) : host(u)}</LinkButton>)}
          {v.demoLinks.map((u) => <LinkButton key={u} href={u} icon={Globe}>{host(u)}</LinkButton>)}
          {v.videoUrl && <LinkButton href={v.videoUrl} icon={PlayCircle}>Demo video</LinkButton>}
        </div>
      )}

      {v.techStack.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tech stack">
          {v.techStack.map((t) => <li key={t}><Badge variant="secondary" className="rounded-md">{t}</Badge></li>)}
        </ul>
      )}

      {v.fullDescription && <Markdown>{v.fullDescription}</Markdown>}

      {v.techDescription && (
        <section>
          <h3 className="mb-3 text-lg">How it&apos;s made</h3>
          <Markdown>{v.techDescription}</Markdown>
        </section>
      )}

      {v.screenshots.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg">Screenshots</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {v.screenshots.map((u, i) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- own CDN upload */}
                  <img src={u} alt={`Screenshot ${i + 1}`} loading="lazy" className="aspect-video w-full rounded-lg border border-line object-cover transition-opacity hover:opacity-90" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(addresses.length > 0 || websites.length > 0 || socials.length > 0) && (
        <dl className="grid gap-6 border-t border-line pt-6 text-sm sm:grid-cols-2">
          {addresses.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="mb-2 text-fg-muted">Deployed contracts</dt>
              <dd className="space-y-1">
                {addresses.map((a) => <p key={a.address} className="flex gap-3"><span className="w-28 shrink-0 truncate text-fg-faint">{a.tag || 'Contract'}</span><code className="truncate">{a.address}</code></p>)}
              </dd>
            </div>
          )}
          {[['Websites', websites], ['Socials', socials]].map(([label, links]) =>
            (links as Tagged[]).length ? (
              <div key={label as string}>
                <dt className="mb-2 text-fg-muted">{label as string}</dt>
                <dd className="space-y-1">
                  {(links as Tagged[]).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer nofollow" className="flex items-center gap-1.5 text-fg-body hover:text-fg-heading">
                      {l.tag || host(l.url)} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ))}
                </dd>
              </div>
            ) : null,
          )}
        </dl>
      )}
    </article>
  )
}
