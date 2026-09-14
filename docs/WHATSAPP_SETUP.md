# WhatsApp (Meta Cloud API) setup

The platform talks to WhatsApp through Meta's Cloud API. One deployment serves many businesses: the app
secret and verify token are deployment-wide (`.env`), while each business keeps its own phone number id
and access token in **Settings > WhatsApp**.

## 1. Meta app and phone number

1. Create a Meta developer account and a **Business** type app at https://developers.facebook.com/apps.
2. Add the **WhatsApp** product. In *API Setup* you get a test number immediately; for production add the
   client's business phone number to their WhatsApp Business Account (WABA) and complete business
   verification.
3. Note the **Phone number ID** and the **WhatsApp Business Account ID**.
4. Create a **System User** in Meta Business Settings with access to the WABA, and generate a permanent
   access token with `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
   (Temporary tokens from the API Setup page expire in 24 hours; fine for a first test only.)
5. In the app dashboard under *App settings > Basic*, copy the **App Secret** into `WHATSAPP_APP_SECRET`.

## 2. Webhook

The API must be reachable over HTTPS. Locally, use a tunnel such as `ngrok http 4000` or Cloudflare Tunnel.

1. Set `WHATSAPP_VERIFY_TOKEN` in `.env` to any secret string and restart the API.
2. In the Meta app, *WhatsApp > Configuration > Webhook*: callback URL `https://<your-host>/webhooks/whatsapp`,
   verify token = the value above. Meta sends `GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
   and the API echoes the challenge.
3. Subscribe to the `messages` webhook field.
4. Every `POST` is verified against `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret),
   stored once by message id (duplicate deliveries are ignored), acknowledged with 200 immediately, and
   processed by the `inbound` queue worker.

## 3. Connect a business

In the dashboard, **Settings > WhatsApp**: enter the phone number id, the access token and the display
phone number. Use **Send test message** to send a text to a number that has messaged the business first
(Meta only allows free-form messages inside the 24-hour customer-service window).

Because inbound webhooks are routed by `phone_number_id`, each business must have a distinct number.

## 4. Message templates (required for reminders)

Business-initiated messages outside the 24-hour window must use approved templates. The platform models
every reminder as a template with ordered parameters (see `reminderTemplates` in the vertical packs). Create
these in *WhatsApp Manager > Message templates* (category **Utility**, language matching
`templateLanguage`) with body parameters `{{1}}`…`{{n}}` in the pack's `paramKeys` order:

| Kind | Default name | Parameters (in order) |
|---|---|---|
| CONFIRMATION | `appt_confirmation` | customerName, businessName, service, dateTime, providerName |
| REMINDER_24H | `appt_reminder_24h` | customerName, businessName, service, dateTime, providerName (+ quick reply buttons: Yes I'll be there / Reschedule / Cancel) |
| REMINDER_2H | `appt_reminder_2h` | customerName, businessName, service, dateTime (+ buttons: On my way / Reschedule) |
| NO_SHOW_FOLLOWUP | `appt_no_show` | customerName, businessName, service (+ buttons: Rebook / Not now) |
| REBOOK_NUDGE | `rebook_nudge` | customerName, businessName (+ buttons: Book now / Not now) |
| REENGAGE | `reengage` | customerName, businessName |

Copy the body text from the pack (`packages/core/src/verticals/shared-templates.ts` and per-pack overrides).
If Meta approves a template under a different name, map it in Settings > WhatsApp > template names
(`templateNames[kind]`). Quick-reply button payloads must be exactly `reminder:confirm`,
`reminder:reschedule`, `reminder:cancel`, `action:book`, `action:later` so the engine recognises the taps.

Approval usually takes minutes to a day. Until then reminders are stored and marked FAILED with the Graph
API error in **Calendar > booking > reminders**; the simulator is unaffected.

## 5. The 24-hour window

Customer messages open a 24-hour window in which free text and interactive buttons are allowed. Replies
from the AI and from staff inside the window are sent as-is. If a reply would go out after the window has
closed, the platform sends the `reengage` template instead and logs a warning; the customer's reply reopens
the window.

## 6. Interactive buttons

Quick replies are sent as `interactive` reply buttons (maximum three, titles up to 20 characters). Taps
arrive as `interactive.button_reply` with the id the platform set, so slot buttons and reminder buttons work
without any extra configuration.

## Troubleshooting

- `403 bad signature`: `WHATSAPP_APP_SECRET` does not match the app, or a proxy rewrote the body. The API
  needs the raw body (enabled in `main.ts`).
- Webhook for unknown `phone_number_id`: no organization has that id in Settings > WhatsApp.
- Messages not sending: check the access token permissions and the template approval status in
  WhatsApp Manager; failures are stored on the message (`deliveryStatus: failed`) and in the API log.
