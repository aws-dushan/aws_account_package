# aws_account_platform

Modular accounting platform for **AWS Distribution**. Module #1: **AR Reconciliation**.
System name TBD. See [docs/DEVELOPMENT-PLAN.md](./docs/DEVELOPMENT-PLAN.md).

> **Status:** the backend is now **ASP.NET Core (.NET 10)**; the Next.js app is a pure
> frontend that calls it over HTTP/JSON. **Backend P0–P2 complete**: auth (Identity + JWT),
> the admin console API (companies/users/permissions/AI-settings/audit), and the full
> **AR Reconciliation core** — upload → learned column mapping → deterministic engine →
> persisted results → colour-coded **Excel + PDF** export, run on a background worker.
> AI enrichment (P3) and PDF ingestion (P4) are wired as pluggable hooks, next to be ported.
> The React UI (login, shell, admin, results, exports, animations) is built and is being
> rewired from the old TypeScript backend to the .NET API.

## Architecture

```
frontend/   Next.js 14 (App Router) · TypeScript · Framer Motion · CSS modules — pure UI, calls the API
backend/    ASP.NET Core Web API (C#, .NET 10) — owns ALL logic
docs/       development plan, phases, design system, multi-tenancy
```

- **Backend:** ASP.NET Core Web API · **EF Core** (Npgsql) · **ASP.NET Core Identity + JWT** ·
  user-based permissions (not roles) · multi-tenant (`tenant = company`, super-admin spans all).
- **Frontend:** Next.js — all React pages, the validated design system, animations, and the
  animated login. No server-side data logic; it talks to the API.
- **DB:** **PostgreSQL, native on the host** (dev laptop and prod VPS). Backend DB `aws_accounting`.
- **AI:** configurable in Settings (Claude/OpenAI/Google/Azure); keys encrypted (AES-256-GCM).
  AI is used **only on rule-failures** — Stage 5 match-rescue, Stage 6 commentary (P3).
- **Ingestion:** Excel/CSV now; PDF tiered native → LLM vision → OCR (P4). Files hashed (SHA-256).
- **Jobs:** in-process **`BackgroundService` + queue** — **no Redis**.
- **Hosting:** single VPS, Docker for the app; Postgres native.

## Prerequisites
- **.NET SDK 10** (`dotnet --version`) and `dotnet-ef` (`dotnet tool install --global dotnet-ef`)
- **Node 18+** and npm
- **PostgreSQL** running natively on `localhost:5432`

## Run the backend (API)
```bash
cd backend
# configure secrets (gitignored): AwsAccounting.Api/appsettings.Development.json
#   ConnectionStrings:Default, Jwt:Key (64 chars), Encryption:Key (base64 32 bytes)
dotnet run --project AwsAccounting.Api
# migrations + seed run automatically on startup
# dev URL: http://localhost:5247  (see Properties/launchSettings.json)
```
Seeded platform super-admin: **`Dev_Admin` / `Admin@12345`** (company: *AWS Distribution*).

Health check: `GET /health`. Dev-only engine self-check: `GET /api/dev/selfcheck`
(asserts the deterministic engine + mapping reproduce the golden fixture: 4 exact, 1 fuzzy,
2 netted, 2 amount-diff, 1 statement-only, 2 customer-only → 63.16% / 5750.00).

## Run the frontend (UI)
```bash
cd frontend
npm install
npm run dev
# open http://localhost:3000  →  redirects to /login
```
Set the API base URL in `frontend/.env` (gitignored).

## Key API surface (P0–P2)
| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login` · `GET /api/auth/me` |
| Companies | `GET/POST /api/companies` · toggle active |
| Users | CRUD, reset-password, `GET/PUT` per-user permissions |
| AI settings | `GET/PUT /api/ai-settings` · `POST /api/ai-settings/test` |
| Audit | `GET /api/audit` |
| **Runs** | `POST /api/runs` (multipart upload) · `GET /api/runs` · `GET /api/runs/{id}` · `/results` · `/export/excel` · `/export/pdf` · `DELETE` |
| **Exceptions** | `GET /api/runs/{id}/exceptions` · `POST /api/exceptions/{id}/approve` · `/adjust` |

All reconciliation endpoints are gated on `ar-reconciliation.*` permissions and tenant-isolated.

## Docs
- [Development plan](./docs/DEVELOPMENT-PLAN.md) · [Multi-tenancy](./docs/multi-tenancy.md) ·
  [Design system](./docs/design-system.md) · [Animated login kit](./docs/animated-login-kit.md)
- Phases: [0](./docs/phases/phase-0-foundation.md) · [1](./docs/phases/phase-1-platform-services.md) ·
  [2](./docs/phases/phase-2-ar-core.md) · [3](./docs/phases/phase-3-ai-layer.md) ·
  [4](./docs/phases/phase-4-ingestion-pdf-ocr.md) · [5](./docs/phases/phase-5-reporting-polish.md) ·
  [6](./docs/phases/phase-6-hardening-handover.md)
