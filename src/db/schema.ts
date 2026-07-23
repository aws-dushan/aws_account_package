import { pgTable, uuid, varchar, boolean, timestamp, primaryKey, text, numeric, jsonb } from "drizzle-orm/pg-core";

/**
 * Tenants = companies. The platform is multi-tenant: each company has its own
 * users and (from Phase 2) its own reconciliation data, isolated by tenant_id.
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Users are admin-provisioned and assigned to a company (tenant). A user with a
 * NULL tenant is a platform super-admin who spans all companies (e.g. Dev_Admin).
 * Auth is username + password (argon2id). Per-user module permissions: Phase 1.
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-user, module-level permissions. Each row grants one capability key
 * (e.g. "ar-reconciliation.run.create") to a user. Super-admins bypass this
 * table entirely (they have every capability).
 */
export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 120 }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.permissionKey] }) }),
);

/**
 * AI provider configuration, one row per purpose ("reasoning" | "vision").
 * Platform-global (configured by the ERP-team super-admin). API keys are stored
 * AES-256-GCM encrypted (never in plaintext). Per-tenant AI config is a future option.
 */
export const aiSettings = pgTable("ai_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  purpose: varchar("purpose", { length: 20 }).notNull().unique(), // reasoning | vision
  provider: varchar("provider", { length: 20 }).notNull(), // google | anthropic | openai | azure
  model: varchar("model", { length: 120 }).notNull(),
  apiKeyEnc: text("api_key_enc"), // AES-256-GCM ciphertext (base64), nullable until set
  baseUrl: varchar("base_url", { length: 255 }), // for Azure / custom endpoints
  temperature: numeric("temperature", { precision: 3, scale: 2 }),
  isActive: boolean("is_active").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only audit trail. No FK to users (records survive user deletion). Captures
 * who did what, to which entity, optionally within which tenant, plus structured metadata.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id"),
  actorUsername: varchar("actor_username", { length: 64 }),
  action: varchar("action", { length: 64 }).notNull(),
  entity: varchar("entity", { length: 64 }),
  entityId: varchar("entity_id", { length: 120 }),
  tenantId: uuid("tenant_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type AiSetting = typeof aiSettings.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;

