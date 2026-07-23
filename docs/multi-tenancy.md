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
**ASP.NET Core Identity + JWT.** `POST /api/auth/login` verifies the username/password
(Identity's hasher) and returns a signed JWT whose claims carry the tenant context:
```
claims = {
  sub / nameidentifier,   // user id
  username, name,
  isAdmin,                // "true" | "false"
  isSuperAdmin,           // isAdmin && tenantId == null
  mustChangePassword,
  tenantId,               // absent/null for super-admins
}
```
The frontend sends the token as `Authorization: Bearer …`; the API reads it via
`CurrentUser` and enforces the authorization policies `Admin` / `SuperAdmin`.

## Tenant isolation rules (enforced server-side)
1. Every query for tenant-owned data filters by the session's `tenantId`.
2. A **super-admin** may act on any company; when they do, the **target company is explicit**
   (chosen in the UI / passed in the request), never implicit.
3. A **company user/admin** can only ever read/write their own `tenantId`. Requests that
   reference another tenant are rejected.
4. Uniqueness that must be per-company (e.g. reconciliation run names) is keyed on
   `(tenant_id, …)`.

## Current status (.NET backend, P0–P2 done)
- EF Core entities: `Tenant` + `ApplicationUser` (Identity, `TenantId?`), `UserPermission`,
  `AiSetting`, `AuditEntry`, and the reconciliation set (`FileRecord`, `ReconciliationRun`,
  `LedgerLine`, `MatchEntity`, `MatchLine`, `ExceptionRow`, `LedgerMapping`).
- `Dev_Admin` seeded as a platform super-admin (`TenantId = null`); seed company
  **AWS Distribution** (`aws-distribution`).
- **ERP-team admin console API delivered (P1):** companies (create/disable), users
  (create picking the company, disable, reset-password, `mustChangePassword`), per-user
  permission ticking, encrypted AI settings + Test-connection, audit log.
- **Tenant isolation enforced (P2):** every reconciliation query filters by the caller's
  tenant; a company user is pinned to their own `TenantId`; a super-admin passes the target
  company explicitly (e.g. `tenantId` on run creation). Run names are unique per `(tenant, …)`.

## Still open
- **Tenant resolution at login** — decide between:
  - a **company selector / code** on the login screen, or
  - **subdomain-based** tenancy (`acme.app.example.com`), with `(tenant_id, username)`
    uniqueness instead of global-unique usernames.
  Until then, usernames are globally unique.
- Optional delegated **company admin** role (currently administration is centralized to the ERP team).
