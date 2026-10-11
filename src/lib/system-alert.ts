/**
 * Fire-and-forget operational alert to the SYSTEM_NOTIFICATION_URL webhook
 * (alphorn.dev-compatible JSON: { title, message, priority }), for operators -
 * same helper as the member portal. Never throws and gives up after 5s
 * (alerting must not break or stall the operation being alerted about) - callers
 * that shouldn't wait at all use `void sendSystemAlert(…)`. No-op when the env
 * var is unset. Never put PII in alerts.
 */
export async function sendSystemAlert(alert: { title: string; message: string; priority?: number }): Promise<void> {
  const url = process.env.SYSTEM_NOTIFICATION_URL
  if (!url) return
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) console.error(`System alert webhook responded ${res.status}`)
  } catch (err) {
    console.error('System alert failed:', err)
  }
}
