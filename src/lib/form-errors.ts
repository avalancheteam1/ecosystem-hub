export type FormIssue = { path: readonly PropertyKey[]; message: string }

/** Keep field paths internal; only known controls get field messages. */
export function collectFieldErrors(issues: readonly FormIssue[], fields: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const path = issue.path.join('.')
    const key = Object.keys(fields).find((key) => path === key || path.startsWith(`${key}.`))
    if (key) errors[key] ??= issue.message
    else errors.form = 'Check the form and try again.'
  }
  return errors
}
