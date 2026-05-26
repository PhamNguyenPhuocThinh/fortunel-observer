import { neon } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = ReturnType<typeof createClient>
export type NodeDatabase = ReturnType<typeof createNodeClient>

export function createClient(databaseUrl: string) {
  const sql = neon(databaseUrl)
  return drizzleNeon(sql, { schema })
}

export function createNodeClient(databaseUrl: string, options?: { max?: number }) {
  const client = postgres(databaseUrl, { max: options?.max ?? 1 })
  return drizzlePg(client, { schema })
}
