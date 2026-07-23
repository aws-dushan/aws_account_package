# Phase 0 — Foundation & Walking Skeleton

> **Status: ✅ done.** After the [.NET pivot](../DEVELOPMENT-PLAN.md), the foundation is an
> **ASP.NET Core Web API** (EF Core + Identity/JWT) plus the Next.js UI. The scope below
> describes the original TypeScript walking skeleton; the delivered .NET equivalent is:
> `AppDbContext` + first EF migration, startup migrate + seed (`Dev_Admin`, company *AWS
> Distribution*), `POST /api/auth/login` → JWT, and the animated Next.js login. Auth is
> **Identity's password hasher + JWT** (not Auth.js/argon2). Redis is dropped.

**Goal:** log in → a themed, empty authenticated shell, running against native Postgres.
Migrations reproducible from scratch.

**Depends on:** nothing (start here).

## Scope
- [ ] Repo init: TypeScript, project structure, `.gitignore`, `.env.example`, README
- [ ] Design tokens: port the validated palette into `globals.css` (light + dark), base reset
- [ ] **Animated login page** (background + entrance/micro animations, brand-themed, reduced-motion safe)
- [ ] `Dockerfile.web`, `Dockerfile.worker`, `docker-compose.dev.yml` (web · worker · redis · tesseract; Postgres is native via `host.docker.internal`)
- [ ] Drizzle setup + first migration (`users`) + seed script (admin, `must_change_password`)
- [ ] Auth.js Credentials (username, argon2id), session, forced first-login password change
- [ ] App shell: indigo masthead, sidebar, theme toggle, route-protection middleware

## Deliverables
- Runnable Next.js app (`npm run dev` and via Docker)
- Animated login screen
- `users` table + seeded admin
- Protected shell layout

## Definition of Done
Admin logs in → sees themed shell → forced password change works → logout works.
`drizzle migrate` reproduces the schema from empty.

## Notes
Tailwind + shadcn/ui are introduced in Phase 1 (login uses hand-authored CSS for richer animation
and zero build risk). Keep the login's dark hero as a committed visual; the card stays theme-aware.
