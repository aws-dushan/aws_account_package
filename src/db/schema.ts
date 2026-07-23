import { pgTable, uuid, varchar, boolean, timestamp, primaryKey, text, numeric, jsonb, integer, date } from "drizzle-orm/pg-core";

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

// ============================================================
//  AR Reconciliation (Phase 2) — all tenant-scoped
// ============================================================

/** Uploaded source files. SHA-256 stored permanently; original retained per policy. */
export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 20 }).notNull(), // statement | customer | report
  originalName: varchar("original_name", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 120 }),
  sizeBytes: integer("size_bytes"),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  storageKey: varchar("storage_key", { length: 255 }), // path in the uploads volume; null once purged
  uploadedBy: uuid("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One reconciliation run: an AWS Statement of Account vs a Customer Ledger for a period. */
export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft|running|completed|failed
  statementFileId: uuid("statement_file_id").references(() => files.id),
  customerFileId: uuid("customer_file_id").references(() => files.id),
  autoMatchPct: numeric("auto_match_pct", { precision: 5, scale: 2 }),
  matchedValue: numeric("matched_value", { precision: 16, scale: 2 }),
  totalDifference: numeric("total_difference", { precision: 16, scale: 2 }),
  unexplained: numeric("unexplained", { precision: 16, scale: 2 }),
  error: text("error"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/** Staged, normalised ledger lines for a run (both sides). */
export const ledgerLines = pgTable("ledger_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => reconciliationRuns.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull(),
  side: varchar("side", { length: 12 }).notNull(), // statement | customer
  reference: varchar("reference", { length: 200 }),
  normRef: varchar("norm_ref", { length: 200 }),
  txnDate: date("txn_date"),
  description: varchar("description", { length: 400 }),
  debit: numeric("debit", { precision: 16, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 16, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 16, scale: 2 }).notNull().default("0"),
  sourceRow: integer("source_row"),
  matchId: uuid("match_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A confirmed/suggested match grouping one or more lines from each side. */
export const matches = pgTable("matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => reconciliationRuns.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull(),
  ruleCode: varchar("rule_code", { length: 8 }).notNull(), // R, RA, RE, F, 1:M, M:1
  method: varchar("method", { length: 8 }).notNull().default("rule"), // rule | ai
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  status: varchar("status", { length: 16 }).notNull().default("auto"), // auto | ai_suggested | user_confirmed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matchLines = pgTable(
  "match_lines",
  {
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    ledgerLineId: uuid("ledger_line_id").notNull().references(() => ledgerLines.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.matchId, t.ledgerLineId] }) }),
);

/** Residual items that did not reconcile, with category + severity (+ AI fields in Phase 3). */
export const exceptions = pgTable("exceptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => reconciliationRuns.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull(),
  ledgerLineId: uuid("ledger_line_id").references(() => ledgerLines.id, { onDelete: "cascade" }),
  categoryCode: varchar("category_code", { length: 12 }).notNull(), // D, E, BAR, F, FR, ...
  severity: varchar("severity", { length: 2 }).notNull(), // g | a | c | r | n
  amount: numeric("amount", { precision: 16, scale: 2 }),
  aiExplanation: text("ai_explanation"),
  aiRecommendation: text("ai_recommendation"),
  aiModel: varchar("ai_model", { length: 120 }),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open|approved|adjusted|resolved
  resolvedBy: uuid("resolved_by"),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type AiSetting = typeof aiSettings.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type LedgerLine = typeof ledgerLines.$inferSelect;
export type ExceptionRow = typeof exceptions.$inferSelect;

