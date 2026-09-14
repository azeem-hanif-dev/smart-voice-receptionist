# Adding a vertical

Verticals are configuration. Adding one takes three small code edits (two enums and a registry line) and
one content file. Budget: under an hour, most of it writing good FAQ and template copy. The seventh vertical,
`NAILSPA` (`packages/core/src/verticals/nailspa.ts`, migration `20260908000000_add_nailspa_vertical`), was
added exactly this way for a real client, A1 Luxury Nail & Spa, whose menu is seeded from their website.

## 1. Register the id (5 minutes)

1. `packages/shared/src/enums.ts`: add the id to `VERTICALS`, e.g. `"OPTOMETRY"`.
2. `packages/db/prisma/schema.prisma`: add the same value to `enum Vertical`, then run
   `pnpm db:migrate` and name the migration `add_optometry_vertical` (Prisma generates the `ALTER TYPE`).

## 2. Write the pack (30–40 minutes)

Create `packages/core/src/verticals/optometry.ts` exporting a `VerticalPack` (see `types.ts` and the
existing packs, `dental.ts` is the most complete). Every field is used somewhere:

| Field | Used by |
|---|---|
| `displayName`, `tagline` | onboarding vertical picker |
| `vocabulary` | prompt terminology (patient/client, provider, appointment, business) and demo model wording |
| `defaultServices` | prefilled services on org creation (durations, buffers, prices) |
| `defaultHours` | prefilled business hours and provider working hours |
| `qualificationQuestions` | what the AI must learn before booking; `prompt` is customer-facing wording, `ask` is the instruction to the model, `when` is `always` or `new_customer`, `options` become buttons |
| `faqSeeds` | prefilled FAQ entries |
| `toneGuidance`, `complianceRules`, `emergencyMessage` | system prompt sections |
| `escalationTriggers` | deterministic pre-model regexes; `emergency: true` sends the emergency message first. Keep them specific (see the benign-sentence tests in `packages/core/test/engine.test.ts`) |
| `reminderTemplates` | one per `ScheduledKind`; `baseTemplates()` in `shared-templates.ts` gives sensible defaults you can spread and override |
| `followUp` | rebooking nudge cadence in days (0 disables) and no-show follow-up delay in minutes |
| `sampleCustomerMessages` | demo chat suggestions and the onboarding preview |

Register it in `packages/core/src/verticals/index.ts` (`VERTICAL_PACKS`). Typecheck fails until every
vertical in the enum has a pack, which is the point.

## 3. Seed and templates (10 minutes)

- Add a demo business to `packages/db/prisma/seed.ts` (`ORGS`) so the vertical is demoable immediately.
- If you changed template wording, submit the new templates in Meta for each WhatsApp business that uses the
  vertical (`docs/WHATSAPP_SETUP.md`). The simulator needs nothing.

## 4. Verify (5 minutes)

```bash
pnpm typecheck
pnpm --filter @ar/core test      # packs are validated; add a benign/real escalation sentence for your triggers
pnpm db:seed && pnpm dev         # pick the vertical in onboarding, book something in the demo chat
```

Nothing in the engine, the API or the dashboard is vertical-specific. If you find yourself adding an
`if (vertical === ...)` anywhere outside a pack, stop and put it in the pack instead.
