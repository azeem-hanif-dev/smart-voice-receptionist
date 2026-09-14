# AI Receptionist — working notes for Claude Code

## What this is
A multi-tenant WhatsApp receptionist for appointment-based small businesses (dental, clinic, salon,
physio, vet, chiro). One vertical-agnostic engine; verticals are config packs. Sold by Kodevengers.

## Stack
- pnpm monorepo, TypeScript everywhere, ESM.
- `packages/shared` (@ar/shared): zod schemas + types. No runtime deps besides zod.
- `packages/db` (@ar/db): Prisma 6 schema, migrations (hand-edited SQL for the exclusion constraint), seed.
- `packages/core` (@ar/core): availability engine (luxon), receptionist engine (manual tool loop over a
  `ModelClient` interface), vertical packs, channel/calendar adapter interfaces, simulator adapter,
  template rendering. **Must not import Nest, Next, Prisma, BullMQ or any channel SDK.**
- `apps/api` (@ar/api): NestJS 11 run with `tsx watch`. Auth, org CRUD, inbox, bookings, analytics,
  WhatsApp webhook/adapter, BullMQ queues, Anthropic model client, Prisma tool executor.
- `apps/web` (@ar/web): Next.js 15 App Router + Tailwind 3 + shadcn/ui. Talks to the API over HTTP.
- Postgres 16 + Redis 7 via docker-compose.

## Commands
```
pnpm install                 # also generates the Prisma client
docker compose up -d         # Postgres + Redis
pnpm db:migrate              # prisma migrate dev (never use `prisma db push`: it drops the exclusion constraint)
pnpm db:seed                 # demo org per vertical, owner logins in README
pnpm dev                     # api on :4000, web on :3000
pnpm test                    # all packages; db/api integration tests need Postgres + Redis running
pnpm typecheck
pnpm demo                    # scripted dental booking / salon reschedule / vet handoff via the simulator
pnpm build
```
Package-level: `pnpm --filter @ar/core test`, `pnpm --filter @ar/api test`, `pnpm --filter @ar/web build`.

## Conventions
- All DB timestamps are `@db.Timestamptz(3)`. Availability math happens in the org's IANA timezone via luxon.
- Booking has customer-facing `startAt/endAt` and `busyStartAt/busyEndAt` (with buffers). The Postgres
  exclusion constraint `booking_no_overlap` is on the busy range and is the source of truth for double-booking.
- The agent never proposes a slot it did not receive from `check_availability`, and never confirms without
  `create_booking` succeeding. Both are enforced in `packages/core/src/engine`, not just in the prompt.
- Model client: `AnthropicModelClient` when `ANTHROPIC_API_KEY` is set, otherwise `RuleBasedModelClient`
  (deterministic demo). Tests use `ScriptedModelClient`.
- Validate at boundaries (webhooks, customer input, HTTP bodies) with zod from @ar/shared; trust internal code.
- Non-obvious decisions go in `docs/decisions.md`. Adding a vertical: `docs/VERTICALS.md`.
- Commit per phase. Keep commits scoped and messages descriptive.
