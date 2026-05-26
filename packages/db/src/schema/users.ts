import { pgTable, pgEnum, uuid, text, timestamp, boolean, customType } from 'drizzle-orm/pg-core'

const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
})

export const userRole = ['owner', 'admin', 'user'] as const
export type UserRole = (typeof userRole)[number]

export const userRoleEnum = pgEnum('user_role', userRole)

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  role: userRoleEnum('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
