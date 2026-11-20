import { describe, expect, it, vi } from 'vitest'
import { createElement, isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProjectPicker, type ProjectPickerOption } from '@/components/project-picker'

const option: ProjectPickerOption = {
  id: 'project-one', slug: 'synthetic-project', name: 'Synthetic project', tagline: 'Synthetic tagline',
  imageUrl: null, maturity: null, versionNumber: 2, sealed: false, members: 2,
  submittedVersion: 1, missing: ['Code repository'],
}
const props = { projects: [option], projectId: option.id, onChange: vi.fn(), returnTo: '/events/synthetic/submit?project=project-one' }
function nodes(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...nodes(node.props.children)]
}
const html = (overrides: Partial<Parameters<typeof ProjectPicker>[0]> = {}) => renderToStaticMarkup(createElement(ProjectPicker, { ...props, ...overrides }))

describe('US-7.1/7.2 project selection shared with PR #9', () => {
  it('selects the checked project and reports the newly chosen ID', () => {
    const onChange = vi.fn()
    const tree = ProjectPicker({ ...props, projects: [option, { ...option, id: 'project-two' }], onChange })
    const radios = nodes(tree).filter((node) => node.type === 'input')
    expect(radios.map((node) => node.props.checked)).toEqual([true, false])
    ;(radios[1].props.onChange as () => void)()
    expect(onChange).toHaveBeenCalledExactlyOnceWith('project-two')
    expect(radios[0].props.name).toBe('project')
  })
  it('retains the PR #9 radio group name and validation props', () => {
    const tree = ProjectPicker({ ...props, name: 'grant-project', invalid: true, describedBy: 'project-error', projectId: '' })
    const radio = nodes(tree).find((node) => node.type === 'input')!
    expect(radio.props.name).toBe('grant-project')
    expect(radio.props['aria-describedby']).toBe('project-error')
    expect(html({ projectId: '', invalid: true })).toContain('border-destructive')
  })
  it('shows the missing checklist and encodes the return path once', () => {
    const markup = html()
    expect(markup).toContain('missing: Code repository')
    expect(markup).toContain(`/projects/${option.slug}/edit?next=${encodeURIComponent(props.returnTo)}`)
    expect(markup).toContain('Edit links or project, then return here to update your submission')
  })
  it('shows required stage guidance when no optional override is supplied', () => {
    expect(html()).toContain('Project stage:')
    expect(html()).toContain('Required, not provided. Edit project to add it.')
  })
  it('US-4.1/4.2 preserves the optional stage guidance', () => {
    expect(html({ optionalProjectFields: ['maturity'] })).toContain('Optional, not provided')
    expect(html({ optionalProjectFields: ['maturity'] })).not.toContain('Required, not provided')
  })
  it('shows a named maturity rather than missing guidance', () => {
    expect(html({ projects: [{ ...option, maturity: 'idea' }] })).toContain('Idea')
    expect(html({ projects: [{ ...option, maturity: 'idea' }] })).not.toContain('not provided')
  })
  it('preserves submitted versus changed-since statuses and revision guidance', () => {
    expect(html()).toContain('changed since')
    expect(html()).toContain('Submitting seals your project as version 2')
    const unchanged = html({ projects: [{ ...option, sealed: true, submittedVersion: 2, missing: [] }] })
    expect(unchanged).toContain('Submitted · v2')
    expect(unchanged).toContain('haven’t changed the project since')
    expect(unchanged).not.toContain('role="alert"')
    expect(html({ projects: [{ ...option, sealed: true, submittedVersion: null }] })).toContain('Submits version 2.')
  })
  it('handles empty options and an unknown selection without edit links or missing alerts', () => {
    for (const overrides of [{ projects: [] }, { projectId: 'unknown' }]) {
      const markup = html(overrides)
      expect(markup).not.toContain('role="alert"')
      expect(markup).not.toContain('/edit?next=')
    }
  })
  it('US-18.3/18.4 retains mobile wrapping and version/member information', () => {
    const markup = html()
    expect(markup).toContain('grid-cols-[auto_minmax(0,1fr)]')
    expect(markup).toContain('break-words text-fg-heading')
    expect(markup).toContain('Version 2 · draft')
    expect(markup).toContain('2 members')
  })
  it('shows own-upload images with empty alt text', () => {
    const tree = ProjectPicker({ ...props, projects: [{ ...option, imageUrl: '/uploads/synthetic.png' }] })
    const img = nodes(tree).find((node) => node.type === 'img')!
    expect(img.props.src).toBe('/uploads/synthetic.png')
    expect(img.props.alt).toBe('')
  })
})
