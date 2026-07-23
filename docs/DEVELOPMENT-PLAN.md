# AWS Distribution — Reconciliation Suite · Development Plan

An AI-powered **AR Reconciliation** application, built as a **modular platform** so more
modules (e.g. AP Reconciliation) can be added later without reworking the core.
"AR Reconciliation" is Module #1.

## Architecture at a glance
- **Frontend/Backend:** Next.js (App Router) + TypeScript
- **DB:** PostgreSQL — **native on the host** (dev laptop and prod VPS), reached from Docker via `host.docker.internal`
- **ORM:** Drizzle
- **Multi-tenant:** a **tenant = a company**; users and data are isolated by `tenant_id`. A platform **super-admin** spans all companies. Users are admin-provisioned by **selecting the company**. See [multi-tenancy.md](./multi-tenancy.md).
- **Auth:** Auth.js (Credentials) — admin-provisioned **username + password** (no email), **argon2id via `hash-wasm`** (portable, no native binary). Session carries `tenantId` / `isSuperAdmin`.
- **Permissions:** per-user, module/feature "ticking" (not roles), scoped within the company. Flags: `is_admin`; super-admin = admin with no tenant.
- **AI:** configurable in Settings — Gemini/Vertex · Claude · OpenAI · Azure OpenAI (Vercel AI SDK). Keys encrypted (AES-256-GCM)
- **AI in reconciliation:** rules first; AI only on **rule-failures** (Stage 5 match-rescue, Stage 6 commentary)
- **Ingestion:** Excel + PDF; tiered OCR = native → LLM vision → Tesseract
- **Files:** local Docker volume; SHA-256 always, configurable retention
- **Jobs:** BullMQ + Redis worker; live progress via SSE
- **Hosting:** single VPS; app/worker/redis/tesseract/traefik in Docker; Postgres native

## Design system
Validated pastel severity + brand colour system (WCAG + colour-blindness checked).
See [design-system.md](./design-system.md). Outputs are colour-coded, pastel, glanceable.

## Phases
| # | Phase | Outcome |
|---|-------|---------|
| 0 | [Foundation & walking skeleton](./phases/phase-0-foundation.md) | `docker compose up` → login → themed shell |
| 1 | [Platform services](./phases/phase-1-platform-services.md) | Users, per-user permissions, AI settings, audit |
| 2 | [AR core (Excel, deterministic)](./phases/phase-2-ar-core.md) | End-to-end Excel reconciliation + colour-coded export ← first demo |
| 3 | [AI layer](./phases/phase-3-ai-layer.md) | AI match-rescue + commentary on rule-failures only |
| 4 | [Ingestion: PDF + OCR](./phases/phase-4-ingestion-pdf-ocr.md) | PDF & scanned-doc intake |
| 5 | [Reporting & polish](./phases/phase-5-reporting-polish.md) | PDF export, animations, accessibility |
| 6 | [Hardening & VPS handover](./phases/phase-6-hardening-handover.md) | Live on the VPS, backups, E2E |

## Sequencing
```
P0 ─▶ P1 ─▶ P2 ═▶ (client-showable) ─▶ P3 ─▶ P4 ─▶ P5 ─▶ P6 (live)
```
Effort (1–2 engineers): P0 small · P1 medium · **P2 largest** · P3 medium · P4 small–med · P5 medium · P6 medium.

## Cross-cutting (every phase)
- Rule engine has **table-driven unit tests**; the NEOMART sample run is the **golden fixture**
- CI: typecheck · lint · unit · build
- Drizzle migrations forward-only + seed
- Security: argon2id, encrypted AI keys, server-side `can()`, signed upload tokens, audit log

## Status
Design + plan agreed. Assets already produced: validated palette, approved output UI,
colour-coded Excel generator (exceljs), reusable [animated login kit](./animated-login-kit.md).

**Phase 0 in progress — done so far:** Next.js app + animated login; **real auth** (Auth.js
Credentials, argon2id via `hash-wasm`, Drizzle + native Postgres); route protection; seeded
platform super-admin (`Dev_Admin`); **multi-tenant foundation** (companies + tenant-scoped users,
tenant in session) — see [multi-tenancy.md](./multi-tenancy.md).
