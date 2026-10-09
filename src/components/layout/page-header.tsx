/**
 * Page title. Title left, actions right on one row; the description sits
 * underneath at full width so long copy never squeezes the actions.
 */
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-10 border-b border-line pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl leading-[1.05] tracking-[-0.012em] sm:text-4xl">{title}</h1>
        {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
      </div>
      {description && <p className="mt-3 max-w-[70ch] text-fg-muted">{description}</p>}
    </div>
  )
}
