// Liveness probe for Railway. Deliberately does not touch the database: a DB
// blip must not abort an otherwise healthy deploy.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true })
}
