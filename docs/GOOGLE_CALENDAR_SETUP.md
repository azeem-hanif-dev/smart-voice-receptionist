# Google Calendar sync (optional)

The platform's own availability engine is always the source of truth for bookable time. Google Calendar
sync is an optional mirror: bookings are pushed to a provider's calendar, and busy events from that
calendar are imported as blocked time so the AI does not offer slots the provider has filled elsewhere.

**Status in this build:** the seam exists (`CalendarAdapter` in `packages/core/src/calendar/types.ts`,
`Organization.calendarConfig`, `Provider.externalCalendarId`, `Booking.externalCalendarEventId`,
`GET /orgs/:id/integrations/google/status`, `GET /integrations/google/connect`) and a
`StubCalendarAdapter` is wired in. The Google implementation is not written yet; the steps below describe
what to configure and what to implement when a client needs it.

## 1. Google Cloud project

1. Create a project at https://console.cloud.google.com and enable the **Google Calendar API**.
2. Configure the OAuth consent screen (external, scopes `https://www.googleapis.com/auth/calendar.events`
   and `https://www.googleapis.com/auth/calendar.readonly`). Add the client's Google account as a test
   user until the app is verified.
3. Create an **OAuth client ID** (Web application) with redirect URI
   `https://<api-host>/integrations/google/callback` (locally `http://localhost:4000/integrations/google/callback`).
4. Put the client id and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`).

## 2. Implementing the adapter

Create `apps/api/src/integrations/google-calendar.adapter.ts` implementing `CalendarAdapter`:

| Method | Google call |
|---|---|
| `pushBooking` | `events.insert` on the provider's calendar (`Provider.externalCalendarId`, default `primary`), store the returned id in `Booking.externalCalendarEventId` |
| `updateBooking` | `events.patch` |
| `deleteBooking` | `events.delete` (on cancel) |
| `fetchBusy` | `freebusy.query` or `events.list` with `singleEvents=true` for the range; return busy intervals |

Wire-up points:

- `GET /integrations/google/connect?orgId=` should redirect to Google's consent URL; the callback exchanges the
  code for a refresh token and stores it in `Organization.calendarConfig` (`provider: "google"`,
  `refreshToken`, `connectedAt`). Encrypt the token at rest if the deployment requires it.
- `BookingsService.create/reschedule/cancel` call the adapter after the database write (never before: the
  exclusion constraint decides whether a booking exists).
- `BookingsService.availability` merges `fetchBusy()` results into each provider's `blocked` intervals. Cache
  them for a minute per provider to keep `check_availability` fast.
- Add a `calendar-sync` BullMQ job (every 5 minutes) that refreshes busy time and retries failed pushes.

## 3. Per-provider calendars

In **Settings > Providers**, set each provider's Google calendar id (their email address for the primary
calendar). Providers without one are not synced.

## 4. Conflict rules

- A Google event that overlaps a platform booking does not cancel the booking; it appears as blocked time
  going forward and staff see both in the calendar view.
- Bookings edited in Google are not pulled back into the platform in this design; edit them in the
  dashboard, which pushes the change out.
