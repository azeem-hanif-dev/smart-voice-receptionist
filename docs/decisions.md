# Decisions

One entry per non-obvious choice. Newest at the bottom.

## Pinned to previous major versions of several dependencies (2026-09-07)
npm currently publishes Prisma 8 RC / 7, NestJS 12, Next 16, TypeScript 7, Vitest 5, BullMQ 6. The team
maintains Prisma 6 / Nest 11 / Next 15 / TS 5 / Vitest 3 / BullMQ 5 and those are the majors whose setup
(Prisma `url` in datasource, `prisma-client-js` generator, Next `middleware`, Tailwind 3 + shadcn classic)
is well understood. Upgrading is a separate task; nothing here depends on newer features.

## Packages export TypeScript source, API runs under tsx
No build step in dev: `@ar/core`, `@ar/shared`, `@ar/db` export `src/index.ts`; the API is started with
`tsx watch` and the web app lists them in `transpilePackages`. Reason: fewer moving parts than a per-package
build + watch pipeline. Consequence: Nest injection uses explicit `@Inject(TOKEN)` for non-class providers
because esbuild does not emit `design:paramtypes` for interfaces.

## Double-booking prevented by a Postgres exclusion constraint
Prisma cannot express `EXCLUDE USING gist`, so the migration SQL is hand-edited. `Booking` stores
`busyStartAt/busyEndAt` (customer times plus service buffers) and the constraint is on that range, filtered to
`PENDING`/`CONFIRMED`. `prisma db push` is deliberately not exposed as a script because it would drop the
constraint. A DB integration test fires concurrent inserts and asserts exactly one wins.

## Availability math uses luxon
Working hours are stored as local wall-clock minutes per weekday and resolved per calendar day in the org's
IANA timezone, then converted to UTC. This is the only approach that is correct across DST transitions.
luxon chosen over date-fns-tz (awkward DST gap semantics) and Temporal (still a polyfill on Node 22).

## Manual tool loop instead of the SDK tool runner
The engine must run against a swappable `ModelClient` (scripted mock in tests, rule-based demo without an API
key, Anthropic in production) and must interpose guardrails between `tool_use` and `tool_result`. The beta
tool runner is tied to the SDK transport. The loop is ~150 lines and fully tested.

## Deterministic demo model when no API key is configured
The spec requires a demo with zero external credentials. `RuleBasedModelClient` is a keyword-driven state
machine that emits the same tool calls a real model would (`check_availability`, `create_booking`, ...), so
the whole pipeline (guardrails, booking, reminders, dashboard) is exercised for real. The dashboard shows a
"Demo model" badge whenever it is active so a prospect is never misled. Setting `ANTHROPIC_API_KEY` switches
to Claude with no other change.

## Simulator processes inbound inline, WhatsApp through BullMQ
Both paths call the same `InboundService.handle()` (dedupe, per-conversation Redis lock, coalescing, engine,
outbound). WhatsApp webhooks must return 200 within a few hundred ms so they enqueue; the demo chat needs
the reply in the HTTP response so it awaits inline. Nothing in the engine knows the difference.

## Reminder jobs keyed `${bookingId}:${kind}`; DB row is the source of truth
Deterministic job ids make reschedule/cancel idempotent. The worker re-reads the `ScheduledMessage` row and
the booking status before sending; removing the Redis job is best effort. Redis runs with
`maxmemory-policy noeviction` so delayed jobs cannot be evicted.

## Quick-reply buttons via a text convention
The model ends a message with `<<buttons: Yes|No|Other time>>` when it wants buttons; the engine strips
and parses it. This avoids a second output tool and keeps the model's reply a single text block. The engine
also auto-attaches up to three slot buttons after `check_availability`.

## Docker Postgres is published on host port 5433
A Homebrew Postgres on the development machine already listens on localhost:5432 and wins over Docker's
wildcard bind, which produced a confusing "role postgres does not exist" error. Publishing the container on
5433 avoids the conflict on any machine with a local Postgres. `DATABASE_URL` in `.env.example` uses 5433.

## Booking CHECK constraints and "only CANCELLED frees a slot" (from the Phase 1 review)
A zero-length or inverted busy range is an empty `tstzrange`, which never overlaps anything, so the exclusion
constraint alone could be bypassed. The migration adds CHECKs (`endAt > startAt`, `busyEndAt > busyStartAt`,
busy range covers the customer window, service duration >= 5 minutes, valid working hours). The exclusion
filter is `status <> 'CANCELLED'` rather than `IN ('PENDING','CONFIRMED')` so marking a booking COMPLETED or
NO_SHOW during the appointment does not free a slot that is still running.

## Availability engine validates its inputs and aligns to the local-clock grid
`computeAvailability` throws on an invalid or offset-less `now`, granularity below 5 minutes, or duration
below 5 minutes instead of silently returning every slot (NaN comparisons fail open). Candidate starts are
aligned to multiples of the granularity from local midnight, not to the window start, so 09:10 hours with a
30-minute grid yield 09:30, 10:00, ... as the settings page promises. Overnight working hours are not
supported (`endMinute <= 1440`); this is enforced by a DB CHECK and the settings validation.

## Org-level `businessHours` next to per-provider working hours
Providers carry the schedule the availability engine uses. The organization also stores its public opening
hours (`businessHours` JSON) for the FAQ/prompt and as the default applied to new providers in onboarding.

## Single-location bookings
`Location` exists on the organization for display and the prompt, but bookings are not tied to a location.
Multi-site scheduling (per-location hours and timezones) is out of scope for this build.

## One inbound pipeline for every channel, idempotent on the provider message id
`InboundService.handle()` writes a `WebhookEvent(provider, eventId)` row first; a unique-constraint hit means
a duplicate delivery and the message is dropped before any side effect. WhatsApp webhooks additionally
return 200 before processing (BullMQ `inbound` queue, job id = message id) because Meta retries slow
webhooks. The simulator awaits the same pipeline inline so the demo chat gets its reply in the response.

## BullMQ job ids use `__` as the separator
BullMQ rejects custom job ids containing `:`. Reminder jobs are `<bookingId>__<kind>` and the same string
is stored in `ScheduledMessage.jobId` so reschedule/cancel/reconcile can find them deterministically.

## Queue key prefix per environment
Queues and workers take `AR_QUEUE_PREFIX` (default `ar`; tests use `ar-test`) so a test run never shares
Redis keys with a running dev server. Tests also obliterate their queues at start.

## Reminders reconcile from the database
The `ScheduledMessage` table is authoritative. On boot and every 10 minutes the worker re-enqueues
SCHEDULED rows whose job is missing from Redis. This is what makes seeded upcoming reminders real, and it
makes a flushed Redis a non-event.

## Seed data is generated, not hand-written
`packages/db/prisma/seed.ts` derives services, hours, FAQs and templates from the vertical packs and uses a
small deterministic PRNG for conversation timing, so every vertical gets equivalent, realistic history
(14 conversations, ~14 bookings, sent reminders, one handoff) and re-seeding is reproducible.

## Explicit `@Inject()` on every constructor parameter in the API
`tsx` (esbuild) does not emit decorator metadata, so Nest cannot infer constructor types. Explicit tokens
are a few characters per parameter and remove the need for a separate build step in development.

## Escalation notification transports (from the Phase 3 review)
The spec requires the escalation contact to be notified on handoff. Without an email provider in the stack,
`NotificationsService` supports dashboard (always), WhatsApp (when connected) and logs the email case. Adding
SMTP or a provider is one transport method; the contact model already carries `notifyVia`.

## Worker processes stored webhook events, marked processed only on success
The webhook controller stores the `WebhookEvent` before enqueueing; the worker calls the pipeline with
`alreadyRecorded: true` (otherwise the unique key made every WhatsApp message look like a duplicate) and
sets `processedAt` only after success so BullMQ retries can recover from transient failures.

## Per-contact lock instead of per-conversation lock
Conversation creation happened outside the lock, so two simultaneous first messages could create two
conversations. The lock key is now `lock:contact:<contactId>:<channel>`, which serialises creation and turns.

## Seeds may override a pack's default menu with real client data
`packages/db/prisma/seed.ts` lets an org seed provide `services`, `hours` and `ownerName` so a real client
(A1 Luxury Nail & Spa, menu and hours taken from the website we built for them) is demoable with their own
prices and specialists while every other org still derives from its vertical pack.
