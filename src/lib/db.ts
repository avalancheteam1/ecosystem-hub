import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaDatabaseUrl?: string }

// Keep the URL paired with the cached client across development reloads.
export const prismaDatabaseUrl = globalForPrisma.prisma ? globalForPrisma.prismaDatabaseUrl : process.env.DATABASE_URL

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: prismaDatabaseUrl,
    // Pool sized for Railway Postgres. Tune via env if needed.
    // Hobby plan caps connections low - keep this conservative.
    // Other tooling (migrations, prisma studio, monitoring) also consumes connections.
    max: parseInt(process.env.DB_POOL_MAX || '5'),
    // Close idle connections to free up Railway-side resources.
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_MS || '30000'),
    // Fail fast on connection issues so requests don't hang.
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECT_MS || '10000'),
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaDatabaseUrl = prismaDatabaseUrl
}
