# Phase 6 — Hardening & VPS Handover

**Goal:** Run live on the single VPS with backups, security, and verified recovery.

**Depends on:** all prior phases.

## Scope
- [ ] `docker-compose.prod.yml` + **Traefik TLS**, app/worker/redis/tesseract; **native host Postgres**
- [ ] **`pg_dump` backup cron** + off-box copy
- [ ] **Retention-purge job** (honours the file retention policy; keeps hash + metadata)
- [ ] Security pass: login rate-limiting, file/input validation, secret handling, server-side capability checks
- [ ] **Playwright E2E** on critical journeys
- [ ] Docs: admin + user guide, deploy runbook
- [ ] **Verified restore drill**

## Deliverables
- Production deployment on the VPS
- Backup/restore, security baseline, E2E suite, operator docs

## Definition of Done
Deployed over TLS on the VPS; backup + restore proven from a clean box; key journeys green in CI.

## Single-VPS resource notes
Size ≥ 8 GB RAM. Cap Postgres `shared_buffers` and worker concurrency so a large reconciliation
run can't starve the database. Redis + Tesseract + worker all share the box.
