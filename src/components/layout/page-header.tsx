/**
 * Page title. Bottom-aligned split on wide screens: title left, description
 * right (seed-sprint's section header), with a hairline underneath.
 */
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-10 grid gap-4 border-b border-line pb-6 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-16">
      <h1 className="text-3xl leading-[1.05] tracking-[-0.012em] sm:text-4xl">{title}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:justify-end">
        {description && <p className="max-w-[52ch] text-fg-muted lg:text-right">{description}</p>}
        {children && <div className="flex shrink-0 gap-2">{children}</div>}
      </div>
    </div>
  )
}
