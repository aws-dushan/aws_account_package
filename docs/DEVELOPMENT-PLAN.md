# AWS Distribution — Reconciliation Suite · Development Plan

An AI-powered **AR Reconciliation** application, built as a **modular platform** so more
modules (e.g. AP Reconciliation) can be added later without reworking the core.
"AR Reconciliation" is Module #1.

> **Architecture pivot (2026-07-23):** the backend moved from Next.js/TypeScript to
> **ASP.NET Core (.NET)**. The Next.js app is now a **pure frontend** that calls the .NET
> **Web API** over HTTP/JSON. The TypeScript backend logic (engine, mapping, AI, exports,
> ingestion) is the **reference spec that has been / is being ported to C#**.

## Architecture at a glance
- **Frontend:** **Next.js (App Router) + TypeScript** — pure UI (React pages, design system,
  animations, animated login). Calls the API; holds no server-side data logic.
- **Backend:** **ASP.NET Core Web API (C#, .NET 10)** — owns ALL logic: auth, multi-tenancy,
  admin (companies/users/permissions), AI settings, audit, reconciliation engine, AI layer,
  ingestion, exports, learned mappings, background worker.
- **DB:** PostgreSQL — **native on the host** (dev laptop and prod VPS). Backend DB `aws_accounting`.
- **ORM:** **EF Core** (Npgsql), forward-only migrations + startup seed.
- **Multi-tenant:** a **tenant = a company**; users and data are isolated by `tenant_id`. A platform **super-admin** spans all companies. Users are admin-provisioned by **selecting the company**. See [multi-tenancy.md](./multi-tenancy.md).
- **Auth:** **ASP.NET Core Identity + JWT** — admin-provisioned **username + password** (no email); Identity's password hasher. The JWT carries `tenantId` / `isAdmin` / `isSuperAdmin` / `mustChangePassword`.
- **Permissions:** per-user, module/feature "ticking" (not roles), scoped within the company. Flags: `is_admin`; super-admin = admin with no tenant. Enforced server-side via `PermissionService.CanAsync`.
- **AI:** configurable in Settings — Claude · OpenAI · Google · Azure OpenAI. Keys encrypted (AES-256-GCM). Live Test-connection.
- **AI in reconciliation:** rules first; AI only on **rule-failures** (Stage 5 match-rescue, Stage 6 commentary). Pluggable hook (`IAiEnricher`), ported in P3.
- **Ingestion:** Excel/CSV (ClosedXML) now; PDF tiered native → LLM vision → OCR (P4, `IPdfGridExtractor` hook). Files hashed (SHA-256), configurable retention.
- **Jobs:** in-process **`BackgroundService` + queue** — **Redis dropped**. Run status/stage polled from the DB.
- **Exports:** colour-coded pastel **Excel (ClosedXML)** + **PDF (QuestPDF)**.
- **Hosting:** single VPS; app in Docker; Postgres native.

## Design system
Validated pastel severity + brand colour system (WCAG + colour-blindness checked).
See [design-system.md](./design-system.md). Outputs are colour-coded, pastel, glanceable.

## Phases
Status columns: **Spec/UI** = the TypeScript reference build (engine logic + React UI);
**.NET API** = the ASP.NET Core port that is now the source of truth.

| # | Phase | Outcome | Spec/UI | .NET API |
|---|-------|---------|:---:|:---:|
| 0 | [Foundation & walking skeleton](./phases/phase-0-foundation.md) | Login → themed shell, on native Postgres | ✅ | ✅ |
| 1 | [Platform services](./phases/phase-1-platform-services.md) | Users, per-user permissions, AI settings, audit | ✅ | ✅ |
| 2 | [AR core (Excel, deterministic)](./phases/phase-2-ar-core.md) | End-to-end reconciliation + colour-coded export ← first demo | ✅ | ✅ |
| 3 | [AI layer](./phases/phase-3-ai-layer.md) | AI match-rescue + commentary on rule-failures only | ✅ | ⏳ hook |
| 4 | [Ingestion: PDF + OCR](./phases/phase-4-ingestion-pdf-ocr.md) | PDF & scanned-doc intake (learns like Excel) | ✅ | ⏳ hook |
| 5 | [Reporting & polish](./phases/phase-5-reporting-polish.md) | PDF export, animations, accessibility | ✅ | ◑ export done |
| 6 | [Hardening & VPS handover](./phases/phase-6-hardening-handover.md) | Live on the VPS, backups, E2E | — | ⏳ |

Legend: ✅ done · ◑ partial · ⏳ pending · *hook* = pluggable interface with a Null impl, ready to port.

## Sequencing
```
.NET backend:  P0 ✅ ─▶ P1 ✅ ─▶ P2 ✅ ═▶ (client-showable) ─▶ P3 ─▶ P4 ─▶ P5 ─▶ P6 (live)
Frontend:      Next.js UI built through P5 — now rewiring from the old TS backend to the .NET API.
```
Effort (1–2 engineers): P0 small · P1 medium · **P2 largest** · P3 medium · P4 small–med · P5 medium · P6 medium.

## Cross-cutting (every phase)
- Reconciliation engine verified against the **golden fixture** (dev self-check `GET /api/dev/selfcheck`)
- EF Core migrations forward-only + startup seed
- Security: Identity password hasher, encrypted AI keys, server-side `PermissionService.CanAsync`, tenant isolation on every query, audit log

## Status
**.NET backend P0–P2 complete.** Delivered:
- **P0** — EF Core + Identity/JWT, entities + first migration, login, seeded platform super-admin
  `Dev_Admin` and seed company **AWS Distribution** (`aws-distribution`).
- **P1** — the ERP-team admin console API: companies, users (create/disable/reset-password/
  select-company), per-user permission ticking, AI settings (encrypted + Test-connection), audit log.
- **P2** — the AR Reconciliation core: multipart upload + SHA-256 storage; **learned column
  mapping** (fingerprint → learned → auto → AI hook → partial, persisted per tenant, Excel/CSV);
  the deterministic **engine** (normalize · Levenshtein fuzzy · reversal netting · exact/1:M/M:1 ·
  amount-diff · D/E/BAR classification · severity); **background worker** (no Redis); run
  results + **exception approve/adjust workflow**; colour-coded **Excel + PDF** export. Verified
  end-to-end (upload → completed run → results/exports) and by the golden self-check (15/15).

**Next:** P3 (port AI rescue + commentary into `IAiEnricher`), P4 (PDF ingestion into
`IPdfGridExtractor`, learning like Excel), then wire the Next.js frontend to the .NET API and P6.
The React UI (login, shell, admin, results, exports, animations) is already built.
See [multi-tenancy.md](./multi-tenancy.md).
