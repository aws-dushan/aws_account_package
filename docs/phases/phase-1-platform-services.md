# Phase 1 — Platform Services (the reusable spine)

> **Status: ✅ done (.NET API).** Delivered as controllers on the ASP.NET Core backend:
> `CompaniesController` (create/disable, `SuperAdmin` policy), `UsersController`
> (create picking the company, disable, reset-password, `GET/PUT` per-user permissions),
> `AiSettingsController` (AES-256-GCM key encryption + live Test-connection for
> Claude/OpenAI/Google/Azure), `AuditController`, and `MetaController` (permission catalog).
> Enforcement is `PermissionService.CanAsync` (server-side) + tenant scoping on every query.
> The Tailwind/shadcn note is superseded — the UI uses hand-authored CSS modules.

**Goal:** Admin creates users, ticks per-user permissions, and configures the AI provider;
the module registry drives the navigation.

**Depends on:** Phase 0.

## Scope
**The ERP-team admin console** (used by the platform super-admin — see [multi-tenancy.md](../multi-tenancy.md)):
- [ ] **Companies (tenants)**: ERP-team admin creates/disables companies; tenant-scoped data isolation helpers
- [ ] Admin → **Users**: create/disable, reset password, `must_change_password`, and **select the company** the user belongs to
- [ ] Admin → **Permissions**: the per-user module/feature **ticking editor** (tree of checkboxes)

Platform spine:
- [ ] Introduce Tailwind + shadcn/ui (Radix primitives), themed to the design system
- [ ] **Module registry** + permission-catalog aggregation (reads each module's `features[]`)
- [ ] **`can()` enforcement in 3 layers:** middleware (routes), server actions/API (mutations), UI (nav/buttons) — plus **tenant scoping** on every query
- [ ] Decide **tenant resolution at login** (company selector/code vs subdomain) — see [multi-tenancy.md](../multi-tenancy.md)
- [ ] Admin → **AI settings**: `ai_settings` per purpose (reasoning/vision); AES-256-GCM key encryption (master key in host env); provider layer via Vercel AI SDK (Gemini/Claude/OpenAI/Azure); **Test-connection**
- [ ] **Audit log**: write + viewer (logins, user/permission changes, AI-setting changes)

## Deliverables
- User & permission administration UI
- Encrypted AI configuration with live connection test
- Audit trail

## Definition of Done
Admin ticks specific features for a user → that user sees only permitted nav/actions
(enforced server-side, not just hidden). A real API key passes Test-connection. Audit records
all admin actions.
