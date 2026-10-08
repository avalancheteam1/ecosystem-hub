/** Public-page section header: big title left, muted copy right, bottom-aligned. */
export function SectionHeading({ title, children, id }: { title: React.ReactNode; children?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-10 grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-20">
      <h2 id={id} className="text-[clamp(2rem,4vw,3.5rem)] leading-[1.05] tracking-[-0.012em]">{title}</h2>
      {children && <div className="max-w-[52ch] text-fg-muted">{children}</div>}
    </div>
  )
}
