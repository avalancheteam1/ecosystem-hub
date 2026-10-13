import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

// Renders trusted-format Markdown (Luma descriptions, organiser text). Raw HTML
// is NOT rendered (react-markdown default) and links open safely.
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Site-internal links (lessons linking each other) stay in the tab.
          a: ({ href, children }) =>
            href?.startsWith('/') && !href.startsWith('//') ? (
              <a href={href}>{children}</a>
            ) : (
              <a href={href} target="_blank" rel="noreferrer nofollow">
                {children}
              </a>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
