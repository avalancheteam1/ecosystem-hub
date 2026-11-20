import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ExportLinks({ hackathonId }: { hackathonId: string }) {
  return <div className="flex flex-wrap gap-3">
    <Button asChild variant="outline"><a href={`/manage/hackathons/${hackathonId}/export.csv`}><Download aria-hidden /> Export CSV</a></Button>
    <Button asChild variant="outline"><a href={`/manage/hackathons/${hackathonId}/not-submitted.csv`}><Download aria-hidden /> Export not submitted CSV</a></Button>
  </div>
}
