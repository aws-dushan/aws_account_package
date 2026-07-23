import { pgTable, uuid, varchar, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";

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

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;

