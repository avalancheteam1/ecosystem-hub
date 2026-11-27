import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, Download } from 'lucide-react'
import { SocialIcon } from '@/components/social-icon'
import { Button } from '@/components/ui/button'
import { OPEN_GRAPH } from '@/lib/metadata'
import { getCurrentUser } from '@/lib/session'
import { DeleteCertificate } from '../../_components/delete-certificate'
import { UpdateCertificateName } from '../../_components/update-certificate-name'
import { certificateDetails, certificateUrl, formatIssued } from '../../_lib/certificate'
import { getAcademy } from '../../_lib/content'
import { getCertificate } from '../../_lib/queries'
import { courseHref, linkedInAddUrl } from '../../_lib/rules'

type Props = { params: Promise<{ id: string }> }

const load = async (params: Props['params']) => {
  const { id } = await params
  return id.length <= 40 ? getCertificate(id) : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cert = await load(params)
  if (!cert) return {}
  // Carries a person's name: shareable, but kept out of search engines.
  const title = `${cert.courseTitle} - Course certificate`
  const description = `${cert.name} completed ${cert.courseTitle} on the team1 Ecosystem Hub.`
  // og:image is the file next to this page (opengraph-image.tsx) - file-based metadata wins over this object.
  return { title, description, robots: { index: false }, openGraph: { ...OPEN_GRAPH, title, description, url: `/education/certificates/${cert.id}` } }
}

export default async function CertificatePage({ params }: Props) {
  const [cert, user] = await Promise.all([load(params), getCurrentUser()])
  if (!cert) notFound()
  const academy = getAcademy(cert.academy)
  const course = academy?.courses.find((c) => c.slug === cert.course)
  const issued = formatIssued(cert.issuedAt)
  const details = certificateDetails(cert)
  const own = user?.id === cert.userId
  const profileName = user?.name.trim()

  return (
    <div className="container-page py-10 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <p className="meta flex items-center gap-2 text-success"><BadgeCheck className="size-4" aria-hidden /> Verified certificate</p>

        {/* HTML rendition of the PDF - same layout, so the link preview and the download agree. Sizes in cqw = the PDF's
            points / 8.42, floored in rem so the small print stays readable on phones. Kanit has no italic: the browser slants it.
            Fixed hex colours (not theme tokens) on purpose: they match the PDF, and the certificate is dark in both themes.
            Headings use 600, which the site already loads; the PDF embeds Kanit Bold (700) itself. */}
        <section className="@container relative mt-4 overflow-hidden rounded-xl border border-line bg-[#0B0A0F] text-center text-[#d4d4d4] sm:aspect-[297/210]">
          <Image src="/education/certificate-background.jpg" alt="" fill sizes="(min-width: 896px) 896px, 100vw" className="object-cover" priority />
          <div className="relative flex h-full flex-col items-center px-[6cqw] pt-[5.9cqw] pb-[5.4cqw]">
            <Image src="/logos/Team1_MAIN_WHITE.svg" alt="team1" width={110} height={31} className="h-[max(1.5rem,3cqw)] w-auto" />
            <p className="mt-[3cqw] font-heading text-[max(1.75rem,5.9cqw)] leading-[0.86] font-semibold tracking-[-0.02em] text-[#e6e6e6]">CERTIFICATE<br />OF COMPLETION</p>
            <p className="mt-[3.6cqw] text-[max(0.95rem,2.1cqw)]">THIS CERTIFIES THAT</p>
            <p className={`mt-[1cqw] font-heading leading-[1.1] font-medium break-words text-brand italic ${cert.name.length > 34 ? 'text-[max(1.25rem,2.6cqw)]' : cert.name.length > 24 ? 'text-[max(1.4rem,3.1cqw)]' : 'text-[max(1.5rem,3.6cqw)]'}`}>{cert.name}</p>
            <p className="mt-[1cqw] text-[max(0.95rem,2.1cqw)]">HAS SUCCESSFULLY COMPLETED THE COURSE</p>
            <p className={`mt-[1.7cqw] max-w-[45cqw] font-heading leading-[0.86] font-semibold tracking-[-0.02em] text-[#e6e6e6] uppercase max-sm:max-w-none ${cert.courseTitle.length > 32 ? 'text-[max(1.25rem,3.1cqw)]' : 'text-[max(1.5rem,4cqw)]'}`}>{cert.courseTitle}</p>
            {details && (
              <div className="text-[max(0.7rem,1.13cqw)] uppercase">
                <p className="mt-[2.6cqw]">{details.place}</p>
                <p className="mt-[3.1cqw]">{details.stats}</p>
                <p className="mt-[0.25cqw] leading-[1.2]">{details.modules.join(' · ')}</p>
              </div>
            )}
            <dl className="mt-auto grid w-full gap-4 pt-8 text-left sm:w-[63cqw] sm:grid-cols-3 sm:gap-0 sm:self-start sm:ml-[14.9cqw]">
              {([['Issued', issued.toUpperCase()], ['Issued by', 'TEAM1 ECOSYSTEM HUB'], ['Certificate ID', cert.id]] as const).map(([k, v]) => (
                <div key={k}>
                  <dt className="font-heading text-[max(0.95rem,1.66cqw)] font-semibold text-[#a3a3a3]">{k.toUpperCase()}</dt>
                  <dd className="mt-[0.7cqw] break-all text-[max(0.7rem,1.13cqw)] text-[#8c8c8c]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[60ch] text-sm text-fg-muted">
            Issued by team1 to <span className="text-fg-heading">{cert.name}</span> on {issued} for completing every lesson and quiz of{' '}
            {academy && course ? <Link href={courseHref(academy, course)} className="underline underline-offset-4 hover:text-fg-heading">{cert.courseTitle}</Link> : cert.courseTitle}. Verification link: <span className="break-all text-fg-body">{certificateUrl(cert.id)}</span>
            {own && (
              <span className="mt-2 block">
                Name not right? <Link href="/profile" className="underline underline-offset-4 hover:text-fg-heading">Change it in your profile</Link>, then update it here. The link and issue date stay the same.
              </span>
            )}
          </p>
          {(own || user?.isSuperAdmin) && (
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              {own && (
                // One grid column = the wider button's width, so both are the same size.
                <div className="grid gap-2">
                  <Button asChild size="lg"><a href={`/education/certificates/${cert.id}/pdf`}><Download aria-hidden /> Download PDF</a></Button>
                  <Button asChild size="lg" variant="outline"><a href={linkedInAddUrl(cert, certificateUrl(cert.id))} target="_blank" rel="noopener noreferrer"><SocialIcon platform="linkedin" /> Add to LinkedIn</a></Button>
                </div>
              )}
              {own && profileName && profileName !== cert.name && <UpdateCertificateName id={cert.id} name={profileName} />}
              <DeleteCertificate id={cert.id} own={own} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
