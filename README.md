# AI Receptionist

A 24/7 WhatsApp receptionist for appointment-based small businesses: it answers questions, qualifies
customers, books, reschedules and cancels appointments, sends reminders, and hands off to a human when it
should. One vertical-agnostic engine; dental, clinic, salon, physiotherapy, veterinary and chiropractic are
config packs on top.

Everything runs locally with **zero external credentials**: a built-in simulator channel replaces WhatsApp,
Google Calendar is a stub, and without an Anthropic key the API uses a deterministic demo model that drives
the same tools and guardrails. Add `ANTHROPIC_API_KEY` to use Claude; add a Meta WhatsApp number to go live.

## Run it

Requirements: Node 22+, Docker (for Postgres and Redis), pnpm 9 (`corepack enable` gives you pnpm).

```bash
cp .env.example .env            # defaults work as-is
pnpm install                    # also generates the Prisma client
docker compose up -d            # Postgres on localhost:5433, Redis on 6379
pnpm db:migrate                 # applies migrations (including the double-booking constraint)
pnpm db:seed                    # one demo business per vertical, with history
pnpm dev                        # API on http://localhost:4000, dashboard on http://localhost:3000
```

`pnpm install` creates `.env` from `.env.example` if it is missing and links `apps/api/.env`, `apps/web/.env`
and `packages/db/.env` to it, so the root `.env` is the only file to edit. If port 4000 or 3000 is taken on
your machine, change `API_PORT`, `API_URL` and `NEXT_PUBLIC_API_URL` (and `APP_URL` for the web port) there. The dashboard port is `WEB_PORT` (default 3000); keep `APP_URL` in step with it.

Sign in at http://localhost:3000/login:

| Vertical | Business | Login | Password |
|---|---|---|---|
| Dental | Bright Smile Dental (New York) | owner@dental.demo | demo1234 |
| Clinic | Riverside Family Clinic (London) | owner@clinic.demo | demo1234 |
| Salon | Studio Luxe Hair (Manchester) | owner@salon.demo | demo1234 |
| Physiotherapy | Motion Physiotherapy (Karachi) | owner@physio.demo | demo1234 |
| Veterinary | Oak Tree Veterinary Clinic (Austin) | owner@vet.demo | demo1234 |
| Chiropractic | Align Chiropractic (Santa Monica) | owner@chiro.demo | demo1234 |
| Nail spa | A1 Luxury Nail & Spa (Carle Place, NY; a real client's menu) | owner@nailspa.demo | demo1234 |

Each demo org also has a `staff@<vertical>.demo` member (same password) with the STAFF role.
Re-running `pnpm db:seed` replaces the demo orgs.

## How to demo it

1. Sign in as the owner of the vertical you are pitching and open **Demo chat**. The phone on screen talks
   to the real engine through the simulator channel. Try the suggested messages, or type: "I'd like to book
   a check-up", answer the questions, tap a time. The booking appears in **Calendar** and **Inbox**.
2. Click **Send 24h reminder now** next to the booking to show the reminder arriving in the chat, then tap
   "Reschedule" or "Cancel" on the reminder to show the engine handling it.
3. Type "Can I speak to a real person?" to show the handoff. The conversation turns amber in **Inbox**;
   reply from there as staff, then **Hand back to AI**.
4. Type an out-of-scope question ("Is it normal for my tooth to hurt after a filling?") to show the
   compliance guardrails, or a question the FAQ does not cover to show it admitting it does not know.
5. **Analytics** shows real counts computed from stored rows (seeded history plus whatever you just did).
6. **Onboarding**: register a new account and walk the wizard to show a new business going live in minutes.

`pnpm demo` runs three scripted conversations (dental booking, salon reschedule, vet handoff) through the
engine from the terminal and prints the transcripts, then removes the data it created (`DEMO_KEEP=1 pnpm demo`
keeps it). It needs the database seeded. Before a client demo, run `pnpm db:seed` once to reset the demo
businesses to their pristine state.

`pnpm demo:video` records a narrated, branded three-minute walkthrough of the dashboard (title card, login,
analytics, a live booking in the demo chat, reminder, FAQ, handoff, inbox, calendar, settings, contacts, closing
contact card) as a 1920x1080 MP4 in `demo-video/`. It uses the installed Google Chrome, `ffmpeg`, and
[`edge-tts`](https://pypi.org/project/edge-tts/) for the male voice-over (`pip install edge-tts`; without it the
video is silent with captions only). Run it while `pnpm dev` is up; the ports come from `.env`. The page is zoomed
so text stays readable on a projector, and every page carries a Kodevengers footer with the website and contact email.

```bash
pnpm demo:video                          # dental demo -> demo-video/ai-receptionist-demo.mp4
RECORD_PRESET=nailspa pnpm demo:video    # A1 Luxury Nail & Spa -> demo-video/a1-luxury-nail-spa-demo.mp4
```

Presets live at the top of `scripts/record-demo.mjs`; any field can be overridden with `RECORD_*` variables
(`RECORD_LOGIN`, `RECORD_BUSINESS`, `RECORD_CUSTOMER`, `RECORD_BOOK_TEXT`, `RECORD_FAQ_TEXT`, `RECORD_ADVICE_TEXT`,
`RECORD_OUT`, ...). Branding: `RECORD_BRAND`, `RECORD_SITE`, `RECORD_EMAIL`. Voice: `RECORD_VOICE` (any edge-tts
voice, default `en-US-AndrewNeural`) and `RECORD_VOICE_RATE` (default `+10%`).

With an API key the "Demo model" badge disappears and the assistant answers in the customer's language
(Urdu, Spanish, and so on). The demo model is English only.

## Environment variables

See `.env.example`; every variable is explained there. The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_TEST` | Postgres for the app and for integration tests |
| `REDIS_URL` | Redis for BullMQ queues |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5`), `ANTHROPIC_EFFORT`, `ANTHROPIC_WORKSPACE_ID` | The agent's model; leave the key empty for the demo model. The workspace id is only needed for organization-level keys not scoped to a workspace |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_VERSION` | Meta app settings (deployment-wide); the phone number id and access token are per business in Settings > WhatsApp |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Optional Google Calendar sync (stubbed until set) |
| `SESSION_SECRET`, `API_PORT`, `API_URL`, `APP_URL`, `NEXT_PUBLIC_API_URL` | App plumbing |

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API (`tsx watch`) and dashboard (`next dev`) together. To run one: `pnpm --filter @ar/api dev`, `pnpm --filter @ar/web dev` |
| `pnpm test` | All test suites: `@ar/core` (availability, engine contract, demo model), `@ar/db` (double-booking constraint), `@ar/api` (pipeline, webhooks, reminders). DB and API tests need Docker running; they use `ai_receptionist_test` and a separate Redis key prefix |
| `pnpm demo` | Scripted transcripts through the engine |
| `pnpm typecheck` / `pnpm build` | Type-check everything / build API and dashboard |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:reset` | Prisma migrate dev / seed / reset |

## Going live with a client

1. Set `ANTHROPIC_API_KEY` in `.env`.
2. Follow `docs/WHATSAPP_SETUP.md` to create the Meta app, point the webhook at `/webhooks/whatsapp`, and
   submit the reminder templates for approval. Enter the phone number id and access token in
   Settings > WhatsApp.
3. Optionally follow `docs/GOOGLE_CALENDAR_SETUP.md`.

## Documentation

- `docs/ARCHITECTURE.md` — how the pieces fit and where the guardrails live
- `docs/VERTICALS.md` — how to add a seventh vertical in under an hour
- `docs/API.md` — the HTTP contract between the dashboard and the API
- `docs/WHATSAPP_SETUP.md`, `docs/GOOGLE_CALENDAR_SETUP.md` — integration setup
- `docs/decisions.md` — why things are the way they are
- `PLAN.md` — phases and acceptance checks; `CLAUDE.md` — conventions for future sessions
