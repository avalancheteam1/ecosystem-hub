import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { OperationsNav } from '@/app/(site)/grants/_components/navigation'
import { ReviewQueue } from '@/app/(site)/grants/_components/review-queue'
import { parseReviewQueue, type ReviewQueueSearchParams } from '@/app/(site)/grants/_lib/review-queue'
import { readReviewQueue } from '@/app/(site)/grants/_lib/review-queue-queries'

export const metadata: Metadata = { title: 'Grant review' }
export default async function GrantReview({ searchParams }: { searchParams: Promise<ReviewQueueSearchParams> }) {
  const location = parseReviewQueue(await searchParams)
  const result = await readReviewQueue(location)
  return (
    <>
      <PageHeader title="Grant review" description="Evidence, decisions and the next useful action." />
      <OperationsNav active="Applications" />
      <ReviewQueue location={location} result={result} />
    </>
  )
}
