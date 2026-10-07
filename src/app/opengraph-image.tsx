import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const alt = 'team1 Ecosystem Hub'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  const logo = await readFile(join(process.cwd(), 'public/logos/Team1_MAIN_WHITE.svg'))
  const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background: 'radial-gradient(ellipse at top right, rgba(230,33,47,0.35), transparent 60%), #0b0a0f',
          color: '#ffffff',
        }}
      >
        <img src={logoSrc} alt="" width={285} height={80} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.05 }}>Ecosystem Hub</div>
          <div style={{ fontSize: 34, color: '#9ca3af', marginTop: 20 }}>Hackathons · Education · Bounties · Projects</div>
        </div>
      </div>
    ),
    size,
  )
}
