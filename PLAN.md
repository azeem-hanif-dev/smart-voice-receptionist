# Build plan

Each phase ends with a commit and a fresh-context review against the specification.

## Phase 0 — Bootstrap
Workspace, tooling, docker-compose, env example, docs skeleton.
**Accept:** `pnpm install` and `pnpm typecheck` pass; `docker compose up -d` is healthy.

## Phase 1 — Data model and availability engine
Prisma schema with DB-level exclusion constraint; luxon availability engine; tests.
**Accept:** `pnpm --filter @ar/core test` green (DST, buffers, holidays, blocked time, rules, any-provider);
`pnpm --filter @ar/db test` green (concurrent inserts for one slot → exactly one succeeds; constraint maps to SLOT_TAKEN).

## Phase 2 — Receptionist engine, simulator, scripted tests
ModelClient interface (+Scripted, +RuleBased), tools, guardrails, prompt assembler, simulator adapter.
**Accept:** scripted conversations prove: no slot offered without `check_availability`; no confirmation without
`create_booking` success; not-offered slot rejected; handoff on request/emergency; model error → retry → handoff;
`@ar/core` has no framework deps. (Duplicate-webhook idempotency lives in the API pipeline and is tested in Phase 3.)

## Phase 3 — API, WhatsApp adapter, reminders
Nest modules, auth, webhook (verify + signature + idempotency), BullMQ inbound + scheduled-messages queues,
per-conversation lock, reminders/follow-ups, Google Calendar stub.
**Accept:** API boots; tests for webhook idempotency, reminder scheduling/reschedule/cancel; curl through the
simulator endpoint books an appointment.

## Phase 4 — Dashboard
Login, onboarding wizard, inbox (takeover/handback), calendar, contacts, analytics, settings, demo chat.
**Accept:** `pnpm --filter @ar/web build` passes; every page loads against seed data; demo chat books end to end.

## Phase 5 — Vertical packs and seeds
Six packs; one demo org per vertical with realistic data and history.
**Accept:** `pnpm db:seed` idempotent; pack test validates every pack; `docs/VERTICALS.md` written.

## Phase 6 — Demo, docs, verification
`pnpm demo`, README, ARCHITECTURE, WHATSAPP_SETUP, GOOGLE_CALENDAR_SETUP, `.env.example`.
**Accept:** `pnpm test`, `pnpm build`, `pnpm demo` all pass from a clean checkout following the README.
