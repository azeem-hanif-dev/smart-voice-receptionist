# Architecture

## Packages

```
packages/shared   zod schemas + types shared by everything (org config, tool inputs, channel messages)
packages/db       Prisma schema, migrations, seed, client singleton, isSlotTakenError()
packages/core     the receptionist engine and everything channel/framework-agnostic
apps/api          NestJS: HTTP API, channel adapters, queues, model client, tool executor
apps/web          Next.js dashboard talking to the API over HTTP
```

`@ar/core` has no dependency on Nest, Next, Prisma, BullMQ or the Anthropic SDK (types only). It can be
tested with an in-memory tool implementation and a scripted model.

## One customer message, end to end

```
WhatsApp webhook ─┐                                  ┌─ WhatsAppAdapter.send (text / buttons / template)
                  ├─► InboundService.handle ─► runTurn ┤
Demo chat (HTTP) ─┘        │                          └─ SimulatorAdapter.send (in-process)
                           │
   1. WebhookEvent unique(provider, eventId): duplicate deliveries are dropped
   2. Contact + Conversation upsert (per org, per phone, per channel)
   3. Redis lock per conversation (SET NX PX): two messages never run two engine turns concurrently
   4. If the conversation is HUMAN/CLOSED: store the message for staff, do not run the AI
   5. runTurn (packages/core): pre-checks, prompt assembly, model loop with tools and guardrails
   6. Persist messages + engine state, deliver replies through the channel adapter, record analytics
```

WhatsApp webhooks are acknowledged immediately and processed by a BullMQ worker (`inbound` queue, job id =
message id). The simulator calls the same service inline because the demo chat needs the reply in the
HTTP response.

## The engine (`packages/core/src/engine`)

`runTurn(input, { model, tools })` is a manual Messages API tool loop:

- **Pre-checks** (`guardrails.ts`): vertical escalation triggers (emergencies, complaints) and explicit
  requests for a human are handled deterministically before any model call. Emergencies get the pack's
  emergency message and a high-urgency handoff.
- **Prompt** (`prompt.ts`): base receptionist rules + business profile (services with ids, providers,
  hours, policies, FAQ) + vertical pack (terminology, tone, qualification questions, compliance rules,
  emergency wording) + contact memory and "now" in the business timezone. The stable part is sent with a
  cache breakpoint.
- **Tools** (`tool-definitions.ts`, schemas in `@ar/shared`): get_business_info, search_faq,
  check_availability, create_booking, find_bookings, reschedule_booking, cancel_booking, confirm_booking,
  update_contact_memory, handoff_to_human. Inputs are validated with zod; failures come back as
  `is_error` tool results, never exceptions.
- **Guardrails enforced in code, not just the prompt**:
  - `create_booking` / `reschedule_booking` are rejected unless the (start, provider, service) was returned
    by `check_availability` in this conversation within the last 30 minutes (`Conversation.engineState`).
  - A final reply that claims a booking is confirmed without a successful booking tool result in the turn
    gets one corrective system message; if the model insists, the reply is replaced with safe text.
  - After `handoff_to_human` the AI is paused: further tool calls in the same turn are refused, and the
    conversation status becomes HUMAN so later messages go to staff.
  - Model errors: retryable ones (429, 5xx, connection, timeout) are retried once, then the engine
    apologises and hands off. Eight tool iterations maximum.
- **Buttons**: the model ends a reply with `<<buttons: A|B|C>>` for quick replies; the engine also
  attaches slot buttons after `check_availability`. Tapped buttons come back as stable ids
  (`slot:<providerId>:<start>`, `reminder:confirm`, `opt:<text>`) that the engine expands to text.
- **History**: messages are stored as content-block JSON rows (USER / ASSISTANT / TOOL / STAFF / SYSTEM)
  and rebuilt into Messages API history each turn, capped at 40 rows, with tool_use/tool_result pairs kept
  intact and orphans dropped.

`ModelClient` has three implementations: `AnthropicModelClient` (API, `claude-sonnet-5` by default),
`RuleBasedModelClient` (deterministic demo used when no API key is set) and `ScriptedModelClient` (tests).

## Availability and booking

`computeAvailability` (`packages/core/src/availability`) is pure: weekly hours in the business timezone
are resolved per calendar day with luxon (DST-safe), blocked time, holidays and existing bookings' busy
ranges (customer window plus service buffers) are subtracted, candidates are aligned to the local-clock
grid, and lead-time / max-advance rules applied. "Any provider" unions per-provider slots and picks the
least-loaded provider per day.

The database is the last line of defence: `Booking` carries `busyStartAt/busyEndAt` and a Postgres
exclusion constraint (`btree_gist`) forbids overlapping busy ranges for the same provider unless the
booking is CANCELLED. CHECK constraints keep ranges non-empty. Violations map to `SLOT_TAKEN`, which the
engine turns into alternatives for the customer and the dashboard into a 409.

## Reminders and follow-ups

`RemindersService` schedules BullMQ delayed jobs with deterministic ids (`<bookingId>__<kind>`):
CONFIRMATION (now), REMINDER_24H / REMINDER_2H (offsets from booking rules), NO_SHOW_FOLLOWUP (after the
appointment, only sent if staff mark it NO_SHOW), REBOOK_NUDGE (pack cadence, only if no future booking).
The `ScheduledMessage` row is the source of truth: the worker re-reads it and the booking before sending;
reschedule/cancel mark rows CANCELLED and remove jobs; a reconciler re-enqueues SCHEDULED rows missing
from Redis. Templates come from the vertical pack (`name`, ordered `paramKeys`, `text`); WhatsApp sends the
approved template by name, the simulator renders the text. Reminder replies (confirm / reschedule / cancel)
are ordinary inbound messages handled by the engine.

## Handoff and notifications

`handoff_to_human` (or a deterministic pre-check) sets the conversation to HUMAN; every later customer
message is stored for staff and the AI stays silent until someone clicks **Hand back to AI**.
`NotificationsService` then notifies the organization's escalation contacts: the dashboard always shows
the conversation under "Needs a human"; contacts with `notifyVia: "whatsapp"` receive a WhatsApp text when
the org has a connected number; `notifyVia: "email"` is a seam only (no mail transport is configured in
this build; the attempt is logged). Owners edit contacts in Settings > Escalation.

## Roles

Every org-scoped route requires membership. OWNER is additionally required for organization settings
(PATCH /orgs/:id, all settings sub-resource writes, WhatsApp configuration). STAFF can use the inbox,
calendar, contacts, analytics and demo chat.

## Channels

`ChannelAdapter` (verify webhook, normalise payload, send text/buttons/template) is the seam. `WhatsAppAdapter`
implements Meta's Cloud API with signature verification and the 24-hour customer-service window rule
(free text outside the window is downgraded to a template). `SimulatorAdapter` is in-process. A Twilio
adapter or a web widget is one class plus one line in `ChannelRegistry`.

## Calendar

`CalendarAdapter` is the seam for two-way sync; `StubCalendarAdapter` is used until Google credentials
exist. The platform's own availability engine stays the source of truth either way.

## Dashboard

Next.js App Router, client components fetching the API with the session cookie. Pages: onboarding wizard,
inbox (take over / hand back / reply), calendar (day/week, manual bookings, blocked time), contacts,
analytics (computed from stored rows), settings, demo chat.
