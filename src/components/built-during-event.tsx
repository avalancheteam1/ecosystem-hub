/** builders-hub's "pre-existing idea" disclosure on a stage entry. */
export function BuiltDuringEvent({ preexisting, text }: { preexisting: boolean; text: string | null }) {
  return (
    <section className="rounded-lg border border-line bg-surface-1 p-4 text-sm">
      <p className="text-fg-heading">{preexisting ? 'Based on a pre-existing idea' : 'Built from scratch during the hackathon'}</p>
      {preexisting && text && <p className="mt-2 whitespace-pre-wrap text-fg-body">{text}</p>}
    </section>
  )
}
