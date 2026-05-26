import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { users } from './users'

export const contactMessages = pgTable(
  'contact_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromName: text('from_name').notNull(),
    fromEmail: text('from_email').notNull(),
    subject: text('subject'),
    message: text('message').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contact_messages_owner_created_idx').on(t.ownerId, t.createdAt.desc()),
    index('contact_messages_owner_unread_idx').on(t.ownerId, t.readAt),
  ],
)

export type ContactMessage = typeof contactMessages.$inferSelect
export type NewContactMessage = typeof contactMessages.$inferInsert
