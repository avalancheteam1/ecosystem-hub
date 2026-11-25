'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const sections = [
  ['case-decision', 'Next action'],
  ['case-application', 'Application'],
  ['case-requests', 'Requests'],
  ['case-evidence', 'Evidence'],
  ['case-assessment', 'Assessment'],
  ['case-activity', 'Recent activity'],
] as const

type Section = (typeof sections)[number][0]

function isSection(value: string): value is Section {
  return sections.some(([id]) => id === value)
}

export function StaffCaseTabs({ panels }: { panels: Record<Section, ReactNode> }) {
  const [active, setActive] = useState<Section>('case-decision')
  const focusTarget = useRef<Section | null>(null)

  const focusSection = useCallback((id: Section) => {
    const panel = document.getElementById(id)
    if (panel && !panel.hidden) {
      focusTarget.current = null
      panel.focus()
    } else {
      focusTarget.current = id
      setActive(id)
    }
  }, [])

  useEffect(() => {
    const syncFragment = (event?: HashChangeEvent) => {
      const fragment = window.location.hash.slice(1)
      if (isSection(fragment)) focusSection(fragment)
      else if (!fragment && event) focusSection('case-decision')
    }
    syncFragment()
    window.addEventListener('hashchange', syncFragment)
    return () => window.removeEventListener('hashchange', syncFragment)
  }, [focusSection])

  useEffect(() => {
    if (focusTarget.current === active) {
      focusTarget.current = null
      document.getElementById(active)?.focus()
    }
  }, [active])

  function select(id: Section) {
    setActive(id)
    if (window.location.hash !== `#${id}`) {
      window.history.replaceState(window.history.state, '', `#${id}`)
    }
  }

  function followSectionLink(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null
    const fragment = anchor?.getAttribute('href')
    if (!fragment) return
    const id = fragment.slice(1)
    if (!isSection(id)) return
    event.preventDefault()
    if (window.location.hash !== fragment) {
      // Let the App Router attach the case state to the new history entry.
      window.history.pushState(null, '', fragment)
    }
    focusSection(id)
  }

  return (
    <Tabs value={active} onValueChange={(id) => { if (isSection(id)) select(id) }}
      activationMode="manual" onClick={followSectionLink} className="gap-6">
      <TabsList aria-label="Case sections" variant="line" className="h-auto! w-full flex-wrap justify-start gap-y-1 border-b border-line">
        {sections.map(([id, label]) => (
          <TabsTrigger key={id} id={`trigger-${id}`} aria-controls={id} value={id}
            className="h-auto min-h-11 flex-none px-3 data-[state=active]:text-fg-heading">{label}</TabsTrigger>
        ))}
      </TabsList>
      {sections.map(([id]) => (
        <TabsContent key={id} id={id} aria-labelledby={`trigger-${id}`} value={id} forceMount
          hidden={active !== id} className="min-w-0 scroll-mt-24 focus-visible:outline-2 focus-visible:outline-ring">
          {panels[id]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
