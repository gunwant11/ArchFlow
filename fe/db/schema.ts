import { pgTable, text, timestamp, jsonb, uuid, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const interiorStyleEnum = pgEnum('interior_style_enum', ['general', 'boho', 'industrial', 'minimalist', 'modern']);

// 1. Projects (Containers for the floor plan and settings)
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  baseImage: text('base_image'), // URL to original floor plan
  canvasState: jsonb('canvas_state'), // Stores nodes and edges (versions)
  
  // Project Settings
  colorPalette: jsonb('color_palette'),
  interiorStyle: interiorStyleEnum('interior_style'),
  materials: jsonb('materials'), // Array of materials
  cameraAngle: jsonb('camera_angle'),
  lighting: jsonb('lighting'),
});

// Relations
export const projectsRelations = relations(projects, ({ one }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
}));

// Auth.js / NextAuth schema tables
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable('accounts', {
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (table) => ({
  pk: { columns: [table.provider, table.providerAccountId], primary: true },
}));

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (table) => ({
  pk: { columns: [table.identifier, table.token], primary: true },
}));

// Auth relations
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  projects: many(projects),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
