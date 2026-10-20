import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const connectedAccounts = sqliteTable('connected_accounts', {
  userId: text('user_id').notNull(),
  provider: text('provider', { enum: ['spotify', 'youtube'] }).notNull(),
  credentials: text('credentials').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.provider] })]);

export const appDocuments = sqliteTable('app_documents', {
  userId: text('user_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
  expiresAt: integer('expires_at'),
}, (table) => [
  primaryKey({ columns: [table.userId, table.key] }),
  index('app_documents_user_expiry_idx').on(table.userId, table.expiresAt),
]);

export const operationLeases = sqliteTable('operation_leases', {
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  token: text('token').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.name] }),
  index('operation_leases_expiry_idx').on(table.expiresAt),
]);

export const schema = { connectedAccounts, appDocuments, operationLeases };
