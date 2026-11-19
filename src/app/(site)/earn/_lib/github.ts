// References only. Parsing does not verify existence, authorship or merge status.
export function githubReference(value: string, kind: 'issues' | 'pull') {
  try {
    const input = value.trim()
    if (/[\\\x00-\x20\x7f]/.test(input)) return null
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) return null
    const match = url.pathname.match(/^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/(issues|pull)\/([1-9]\d*)\/?$/)
    if (!match || match[3] !== kind || !Number.isSafeInteger(Number(match[4]))) return null
    const repository = `${match[1]}/${match[2]}`.toLowerCase()
    return { repository, number: Number(match[4]), url: `https://github.com/${repository}/${kind}/${Number(match[4])}` }
  } catch {
    return null
  }
}
