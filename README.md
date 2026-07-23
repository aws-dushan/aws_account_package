# aws_account_platform

Modular accounting platform for **AWS Distribution**. Module #1: **AR Reconciliation**.
System name TBD. See [docs/DEVELOPMENT-PLAN.md](./docs/DEVELOPMENT-PLAN.md).

> **Status:** Phase 0 — foundation. The animated **login flow is live**; the authenticated
> shell, permissions, AI settings, and the reconciliation engine follow in Phases 1–2.

## Stack
Next.js (App Router) · TypeScript · Framer Motion · (Drizzle + Auth.js + Postgres land in Phase 0/1)

## Run locally (fastest)
Postgres runs **natively** on your machine (not required yet for the login preview).

```bash
npm install
npm run dev
# open http://localhost:3000  →  redirects to /login
```

## Run with Docker (dev)
Postgres stays native on the host; containers reach it via `host.docker.internal`.

```bash
docker compose -f docker-compose.dev.yml up
```

## Environment
Copy `.env.example` → `.env.local` and fill in values. Postgres is expected on the host at
`localhost:5432` (native), database `aws_account_platform`.

## Project layout
```
docs/                      development plan, phases, design system
src/app/                   Next.js App Router
  login/                   animated login (background canvas + form)
  dashboard/               placeholder (real shell = Phase 1)
docker/                    Dockerfiles (prod build)
docker-compose.dev.yml     web + redis (Postgres native on host)
```
