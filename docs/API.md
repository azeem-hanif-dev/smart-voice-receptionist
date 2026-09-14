# HTTP API contract (apps/api)

Base URL: `API_URL` (default `http://localhost:4000`). JSON in and out. Auth is a session cookie `ar_session`
(httpOnly, SameSite=Lax) set by register/login; the web app calls with `credentials: "include"`. CORS allows
`APP_URL` with credentials. Errors: `{ statusCode, message, issues?[] }` with 400 (validation), 401, 403 (not a member, or owner-only
route called by staff), 404, 409 (`{ statusCode: 409, reason: "SLOT_TAKEN", message, alternatives: Slot[] }` for a
taken slot; duplicate registration). Owner-only routes: PATCH /orgs/:orgId, every POST/PATCH/DELETE under the
settings sub-resources except blocked-times (staff may block time), and /orgs/:orgId/whatsapp/*. All org-scoped routes require membership of `:orgId`. Times are ISO 8601 UTC unless stated;
dates are `YYYY-MM-DD` in the org timezone.

## Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | /auth/register | `{ email, password (min 8), name }` | `{ user, orgs: [] }` + cookie |
| POST | /auth/login | `{ email, password }` | `{ user, orgs: OrgSummary[] }` + cookie |
| POST | /auth/logout | | `{ ok: true }` |
| GET | /auth/me | | `{ user: { id, email, name }, orgs: OrgSummary[], modelMode: "anthropic" \| "demo", model: string }` |

`OrgSummary = { id, name, slug, vertical, timezone, role, onboardedAt }`

## Verticals and organizations
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /verticals | | `{ id, displayName, tagline, vocabulary, defaultServices, defaultHours, faqSeeds, qualificationQuestions, sampleCustomerMessages }[]` |
| POST | /orgs | `{ name, vertical, timezone, currency? }` (currency defaults from the timezone: GBP, PKR, EUR, AUD, CAD, AED, INR, else USD) | `Org` (prefilled services, FAQs, business hours, brand voice from the vertical pack; caller becomes OWNER) |
| GET | /orgs/:orgId | | `Org` |
| PATCH | /orgs/:orgId | any of `{ name, timezone, brandVoice, bookingRules, escalationContacts, businessHours, whatsappConfig (object or null), calendarConfig, onboarded: true }` | `Org` |
| GET | /orgs/:orgId/vertical-pack | | the pack (vocabulary, qualification questions, templates...) |

`Org = { id, name, slug, vertical, timezone, plan: "TRIAL" | "STARTER" | "PRO", brandVoice, bookingRules, businessHours: { weekday, startMinute, endMinute }[], whatsappConfig (accessToken masked as "•••"), whatsappConnected: boolean, escalationContacts, calendarConfig, onboardedAt, counts: { providers, services, faqs, contacts, conversations, bookings } }`

On PATCH, `whatsappConfig.accessToken` may be omitted or `"•••"` to keep the stored token; `phoneNumberId` is required.

## Settings sub-resources (all under /orgs/:orgId)
| Resource | Routes | Body |
|---|---|---|
| services | GET /services, POST /services, PATCH /services/:id, DELETE /services/:id | `{ name, description?, durationMinutes, bufferBeforeMinutes?, bufferAfterMinutes?, priceCents?, currency?, active?, sortOrder?, providerIds?: string[] }` → returns service with `providerIds` |
| providers | GET /providers, POST /providers, PATCH /providers/:id, DELETE /providers/:id | `{ name, title?, active?, color?, serviceIds?: string[], workingHours?: { weekday, startMinute, endMinute }[] }` → returns provider with `serviceIds`, `workingHours` |
| faqs | GET /faqs, POST /faqs, PATCH /faqs/:id, DELETE /faqs/:id | `{ question, answer, keywords?: string[], sortOrder? }` |
| holidays | GET /holidays, POST /holidays, DELETE /holidays/:id | `{ date: "YYYY-MM-DD", name }` |
| blocked-times | GET /blocked-times?from&to (both optional; all rows when omitted), POST /blocked-times, DELETE /blocked-times/:id | `{ providerId?: string \| null, startAt, endAt, reason? }` |
| locations | GET /locations, POST /locations, PATCH /locations/:id, DELETE /locations/:id | `{ name, address?, phone? }` |
| members | GET /members, POST /members, DELETE /members/:userId | `{ email, name, password, role: "OWNER" \| "STAFF" }` (creates the user if the email is new) → `{ userId, email, name, role, createdAt }` |

## Contacts
| Method | Path | Returns |
|---|---|---|
| GET | /orgs/:orgId/contacts?q= | `{ id, phoneE164, name, language, memory, optedOut, lastConversationAt, bookingsCount, createdAt }[]` |
| GET | /orgs/:orgId/contacts/:id | contact + `bookings[]` + `conversations[]` (summaries) |
| PATCH | /orgs/:orgId/contacts/:id | `{ name?, email?, language?, optedOut?, memory? }` |

## Inbox (conversations)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /orgs/:orgId/conversations?status=AI\|HUMAN\|CLOSED&q= | | `ConversationSummary[]` newest first |
| GET | /orgs/:orgId/conversations/:id | | `{ conversation, contact, messages: Message[], bookings: Booking[] }` |
| POST | /orgs/:orgId/conversations/:id/takeover | | conversation (status HUMAN) |
| POST | /orgs/:orgId/conversations/:id/handback | | conversation (status AI) |
| POST | /orgs/:orgId/conversations/:id/messages | `{ text }` | the stored staff message (also delivered to the customer via the channel) |
| POST | /orgs/:orgId/conversations/:id/close | | conversation (status CLOSED) |
| POST | /orgs/:orgId/conversations/:id/read | | `{ ok }` |

`ConversationSummary = { id, channel, status, handoffReason, handoffAt, lastMessagePreview, lastMessageAt, unreadCount, contact: { id, name, phoneE164 } }`
`Message = { id, role: USER|ASSISTANT|STAFF|SYSTEM, direction: "INBOUND" | "OUTBOUND", text, buttons?: {id,title}[], templateName?, deliveryStatus?, createdAt, authorUserId? }` (TOOL rows and empty assistant rows are omitted; SYSTEM rows are reminders/templates and handback notes)

## Bookings and calendar
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | /orgs/:orgId/bookings?from&to&providerId&status | | `Booking[]` |
| POST | /orgs/:orgId/bookings | `{ serviceId, providerId, startAt, notes?, contactId? \| contact?: { phoneE164, name? } }` | `Booking` (409 `{ reason: "SLOT_TAKEN", alternatives }` if taken) |
| PATCH | /orgs/:orgId/bookings/:id | `{ startAt?, providerId?, notes?, status?: CONFIRMED\|COMPLETED\|NO_SHOW\|CANCELLED }` | `Booking` (reschedule when startAt/providerId change; reminders re-queued) |
| POST | /orgs/:orgId/bookings/:id/cancel | `{ reason? }` | `Booking` |
| GET | /orgs/:orgId/availability?serviceId&providerId?&fromDate&toDate | | `{ slots: Slot[], timezone }` (all slots, for the manual booking dialog) |
| GET | /orgs/:orgId/scheduled-messages?bookingId | | `{ id, kind, templateName, runAt, status, sentAt }[]` |

`Booking = { id, status, source, startAt, endAt, notes, cancelReason, confirmedByCustomerAt, contact: { id, name, phoneE164 }, service: { id, name, durationMinutes }, provider: { id, name, color }, conversationId, createdAt }`

## Analytics
`GET /orgs/:orgId/analytics?days=30` →
```
{ days, from, to, timezone,
  conversations, aiReplies, bookingsByAi, bookingsManual, remindersSent, customerConfirmations,
  cancellations, reschedules, handoffs, handoffRate (0..1 or null), medianFirstResponseMs (number or null),
  guardrailBlocks, modelErrors,
  series: { date, conversations, bookings }[] }
```
All numbers are computed from stored rows; zero means zero. `handoffs`/`handoffRate` count conversations
started in the range that were handed to a human at least once; `medianFirstResponseMs` is the median time
from a conversation's first customer message to the AI's first reply.

## Simulator (demo chat)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | /orgs/:orgId/simulator/messages | `{ phoneE164, text, buttonId?, displayName? }` | `{ conversationId, status, replies: { text, quickReplies? }[], handoff?, modelMode }` |
| GET | /orgs/:orgId/simulator/conversation?phoneE164 | | same shape as GET conversation (or `{ conversation: null }`) |
| POST | /orgs/:orgId/simulator/reset | `{ phoneE164 }` | `{ ok }` deletes that contact's conversation, bookings and scheduled messages |
| POST | /orgs/:orgId/simulator/send-reminder | `{ bookingId, kind: REMINDER_24H \| REMINDER_2H \| NO_SHOW_FOLLOWUP \| REBOOK_NUDGE }` | sends that template now into the conversation (demo of reminders) |

When the conversation is in HUMAN status the simulator stores the customer's message and returns no replies; staff answer from the inbox.

## WhatsApp
- `GET /webhooks/whatsapp?hub.mode&hub.verify_token&hub.challenge` → echoes the challenge when the token matches `WHATSAPP_VERIFY_TOKEN`.
- `POST /webhooks/whatsapp` → verifies `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`, dedupes by message id, enqueues, returns 200 immediately.
- `POST /orgs/:orgId/whatsapp/test-message` `{ to }` → sends a text via the Graph API using the org's config (for connection testing).

## Integrations
- `GET /orgs/:orgId/integrations/google/status` → `{ configured: boolean, connected: boolean }`
- `GET /integrations/google/connect?orgId` → 501 with instructions until `GOOGLE_CLIENT_ID` is set.

## Health
`GET /health` → `{ ok: true, modelMode, queues: { inbound, scheduled } }`
