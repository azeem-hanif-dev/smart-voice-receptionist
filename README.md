# Smart Voice Receptionist

An always-on WhatsApp front desk for appointment-driven businesses. It handles the repetitive part of running a front desk — answering questions, qualifying leads, booking, rescheduling and cancelling appointments, sending reminders, and knowing when to step aside for a human — behind a single conversational engine that adapts to whatever business it's dropped into (dental, clinic, salon, physio, vet, chiropractic, and more, each as a lightweight config pack rather than a separate build).

## Why it's built this way

Most "AI receptionist" demos need a live WhatsApp number and a paid API key before you can even see them work. This one doesn't: a built-in simulator channel stands in for WhatsApp, Google Calendar syncing is stubbed out, and if no Anthropic key is set, a deterministic demo model still drives every tool call and guardrail so the whole flow is testable offline. Plug in `ANTHROPIC_API_KEY` and a Meta WhatsApp number when you're ready to go live, and nothing else changes.

## Getting it running

You'll need Node 22+, Docker (for Postgres and Redis), and pnpm 9 (`corepack enable` gets you there).

```bash
cp .env.example .env      # defaults are enough to start
pnpm install               # also generates the Prisma client
docker compose up -d       # Postgres on :5433, Redis on :6379
pnpm db:migrate            # applies migrations
pnpm db:seed                # seeds one demo business per vertical
pnpm dev                    # API on :4000, dashboard on :3000
```

`pnpm install` will create `.env` from `.env.example` automatically if it's missing, and wires it up to `apps/api/.env`, `apps/web/.env` and `packages/db/.env` — the root `.env` is the only file you need to touch. Ports are configurable via `API_PORT`/`API_URL`/`NEXT_PUBLIC_API_URL` and `WEB_PORT`/`APP_URL`.

## Trying it out

Log in at `localhost:3000/login` with any of the seeded demo accounts (password `demo1234` across the board) — dental, clinic, salon, physiotherapy, veterinary, chiropractic and nail-spa businesses are all pre-loaded with history. Each org also has a staff-level login for testing the human handoff.

From the dashboard, open **Demo chat** and talk to the engine directly through the simulator:

- Ask to book an appointment and walk through the flow — the booking shows up live in Calendar and Inbox.
- Trigger a 24-hour reminder and then reschedule or cancel from inside it.
- Ask to speak to a person and watch the conversation flip to a human-handled state in the Inbox.
- Ask something out of scope to see the guardrails (and the honest "I don't know") kick in.

Analytics reflects real data computed from what's actually stored, so anything you do in the demo shows up there too.

## Under the hood

- **Monorepo**: `apps/api` (the engine + webhooks), `apps/web` (the dashboard, Next.js), `packages/db` (Prisma/Postgres).
- **Queues**: Redis + BullMQ for reminders and async work.
- **Model**: Anthropic Claude by default (`ANTHROPIC_MODEL`), with a deterministic offline fallback when no key is set.
- **Channels**: WhatsApp Business (Meta Graph API) for production, an in-app simulator for local/demo use.
- **Calendar**: optional Google Calendar sync, stubbed until credentials are supplied.

Useful commands: `pnpm test` (full suite, needs Docker up), `pnpm typecheck`, `pnpm build`, `pnpm demo` (scripted conversations through the engine from the terminal), `pnpm db:reset`.

## Taking it live

1. Set `ANTHROPIC_API_KEY`.
2. Register a Meta app, point its webhook at `/webhooks/whatsapp`, and get the reminder message templates approved — see `docs/WHATSAPP_SETUP.md`.
3. Enter the WhatsApp phone number ID and access token under Settings.
4. Optionally connect Google Calendar — see `docs/GOOGLE_CALENDAR_SETUP.md`.

## Docs

- `docs/ARCHITECTURE.md` — how the pieces fit together, and where the guardrails live
- `docs/VERTICALS.md` — adding a new business vertical
- `docs/API.md` — the API contract between dashboard and backend
- `docs/decisions.md` — design decisions and the reasoning behind them
