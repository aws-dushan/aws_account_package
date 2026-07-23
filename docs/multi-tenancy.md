# Multi-Tenancy

The platform is **multi-tenant and multi-user**. A **tenant = a company**. Each company
has its own users and (from Phase 2) its own reconciliation data, isolated by `tenant_id`.

## Roles
| Role | tenant_id | is_admin | Who / what they do |
|---|---|---|---|
| **Platform admin — ERP team** (super-user, e.g. `Dev_Admin`) | `NULL` | `true` | **Platform staff, not a company user.** The administrator of the whole system: creates **companies**, creates **user accounts** (selecting the company each belongs to), and **assigns per-user permissions**. Acts across all companies. |
| **Company user** | a company | `false` | An end-user of a company. Uses only the modules/features the ERP-team admin granted them, scoped to their own company's data. |
| **Company admin** *(optional, future)* | a company | `true` | If enabled later: delegated user management **within one company**. Not required — administration is centralized to the ERP-team admin. |

> **Provisioning is centralized to the ERP-team admin.** There is no self-registration.
> The admin creates the company, then creates each user account **selecting that company**,
> then ticks the user's permissions. Company users cannot create accounts or companies.

## Data model
```
tenants (companies)
  id · name · slug (unique) · is_active · created_at

users
  id · tenant_id → tenants.id  (NULL = platform super-admin) · username (unique)
  password_hash · display_name · is_admin · is_active · must_change_password · created_at
```
Every tenant-owned table added later (reconciliation runs, ledger lines, files, exceptions,
audit) carries a `tenant_id` FK and is always filtered by the caller's tenant.

## Auth & session
Auth.js (Credentials) puts tenant context in the JWT/session:
```
session.user = {
  id, username, name, isAdmin, mustChangePassword,
  tenantId,        // null for super-admins
  tenantSlug,      // null for super-admins
  isSuperAdmin,    // isAdmin && !tenantId
}
```

## Tenant isolation rules (enforced server-side)
1. Every query for tenant-owned data filters by the session's `tenantId`.
2. A **super-admin** may act on any company; when they do, the **target company is explicit**
   (chosen in the UI / passed in the request), never implicit.
3. A **company user/admin** can only ever read/write their own `tenantId`. Requests that
   reference another tenant are rejected.
4. Uniqueness that must be per-company (e.g. reconciliation run names) is keyed on
   `(tenant_id, …)`.

## Current status (Phase 0)
- `tenants` + tenant-scoped `users` schema in place.
- `Dev_Admin` seeded as a platform super-admin (`tenant_id = NULL`).
- One seed company: **AWS Distribution** (`aws-distribution`).
- Session carries `tenantId` / `isSuperAdmin`.

## Planned (Phase 1+) — the ERP-team admin console
- **Company management**: create/disable companies.
- **User creation**: admin picks the **company**, sets username + temp password,
  `must_change_password = true`.
- **Permission assignment**: per-user, per-module/feature ticking, scoped within the
  user's company.
- These three (companies · users · permissions) are the ERP-team admin's core screens.
- **Tenant resolution at login** — decide between:
  - a **company selector / code** on the login screen, or
  - **subdomain-based** tenancy (`acme.app.example.com`), with `(tenant_id, username)`
    uniqueness instead of global-unique usernames.
  Until then, usernames are globally unique.
- Full **tenant-scoped audit log**.
