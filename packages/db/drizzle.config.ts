import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env['DATABASE_URL'] ?? 'postgres://dev:dev@localhost:5432/platform_dev'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
})
