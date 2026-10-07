import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Match Next.js precedence: .env (baseline) then .env.local (overrides).
if (existsSync('.env')) process.loadEnvFile('.env')
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

export default defineConfig({
  // Multi-file schema: one .prisma file per area (auth, access, hackathons, …).
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
