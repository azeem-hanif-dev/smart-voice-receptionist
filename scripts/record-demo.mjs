/**
 * Records a narrated, branded walkthrough of the dashboard as an MP4 (1920x1080, male voice-over).
 *
 *   pnpm dev                                   # API and web with seed data (ports from .env)
 *   RECORD_PRESET=nailspa pnpm demo:video      # writes demo-video/a1-luxury-nail-spa-demo.mp4
 *   pnpm demo:video                            # dental demo, demo-video/ai-receptionist-demo.mp4
 *
 * Requires Google Chrome (Playwright uses it via channel "chrome"), ffmpeg, and edge-tts for the
 * voice-over (`pip install edge-tts`). Without edge-tts the video is recorded silent with captions only.
 *
 * Every step has a narration line; the recording waits for each line to finish before moving on, and the
 * clips are mixed onto the video afterwards at the exact moment they were shown. Presentation:
 *  - the page is rendered at 1440x810 CSS px and zoomed 4/3 into a 1920x1080 frame so text stays large and crisp
 *  - a Kodevengers footer (website + contact email) is pinned to the bottom of every page
 *  - a title card opens and a contact card closes the video
 */
import { chromium } from "playwright";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ---------- Configuration ----------
try { process.loadEnvFile(path.resolve(".env")); } catch { /* no .env: defaults below */ }
const PRESETS = {
  dental: {
    LOGIN: "owner@dental.demo", BUSINESS: "Bright Smile Dental", CUSTOMER: "Sara Khan",
    BOOK_TEXT: "I'd like to book a check-up and clean", SERVICE: "a check-up and clean",
    FAQ_TEXT: "Do you take insurance?", FAQ_TOPICS: "insurance, parking, opening hours",
    ADVICE_TEXT: "Is it normal for my tooth to hurt after a filling?", ADVICE_TOPIC: "a sore tooth after a filling",
    WHO: "patient", PLACE: "practice", PROVIDER: "dentist", OUT: "ai-receptionist-demo",
  },
  nailspa: {
    LOGIN: "owner@nailspa.demo", BUSINESS: "A1 Luxury Nail & Spa", CUSTOMER: "Ayesha Malik",
    BOOK_TEXT: "Hi, can I book a gel manicure this week?", SERVICE: "a gel manicure",
    FAQ_TEXT: "Do you take walk-ins?", FAQ_TOPICS: "walk-ins, parking, gift cards, the cancellation policy",
    ADVICE_TEXT: "My nail looks infected, what should I put on it?", ADVICE_TOPIC: "a possible infection",
    WHO: "client", PLACE: "spa", PROVIDER: "nail technician", OUT: "a1-luxury-nail-spa-demo",
  },
};
const preset = PRESETS[process.env.RECORD_PRESET ?? "dental"];
if (!preset) throw new Error(`Unknown RECORD_PRESET; use one of ${Object.keys(PRESETS).join(", ")}`);
const env = (key, fallback) => process.env[`RECORD_${key}`] ?? fallback;

const WEB = env("WEB_URL", process.env.APP_URL ?? `http://localhost:${process.env.WEB_PORT ?? 3000}`);
const API = env("API_URL", process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`);
const INSECURE = process.env.RECORD_INSECURE === "1";
const LOGIN = env("LOGIN", preset.LOGIN);
const PASSWORD = env("PASSWORD", "demo1234");
const BUSINESS = env("BUSINESS", preset.BUSINESS);
const BUSINESS_SPOKEN = env("BUSINESS_SPOKEN", BUSINESS.replace(/&/g, "and"));
const CUSTOMER = env("CUSTOMER", preset.CUSTOMER);
const BOOK_TEXT = env("BOOK_TEXT", preset.BOOK_TEXT);
const SERVICE = env("SERVICE", preset.SERVICE);
const FAQ_TEXT = env("FAQ_TEXT", preset.FAQ_TEXT);
const FAQ_TOPICS = env("FAQ_TOPICS", preset.FAQ_TOPICS);
const ADVICE_TEXT = env("ADVICE_TEXT", preset.ADVICE_TEXT);
const ADVICE_TOPIC = env("ADVICE_TOPIC", preset.ADVICE_TOPIC);
const WHO = env("CUSTOMER_WORD", preset.WHO);
const PLACE = env("PLACE_WORD", preset.PLACE);
const PROVIDER = env("PROVIDER_WORD", preset.PROVIDER);
const OUT_NAME = env("OUT", preset.OUT);
// Branding shown in the title card, footer and closing card.
const BRAND = env("BRAND", "Kodevengers");
const SITE = env("SITE", "www.kodevengers.com");
const EMAIL = env("EMAIL", "imran@kodevengers.com");
// Voice-over: any male edge-tts voice works (en-US-GuyNeural, en-GB-RyanNeural, en-US-ChristopherNeural...).
const VOICE = env("VOICE", "en-US-AndrewNeural");
const VOICE_RATE = env("VOICE_RATE", "+10%");

const FIRST = CUSTOMER.split(" ")[0];
const OUT = path.resolve("demo-video");
const WORK = path.join(OUT, ".work");
fs.mkdirSync(WORK, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith(".webm") || f === "error.png") fs.unlinkSync(path.join(OUT, f));
const PHONE = `+1 555 030 ${String(Date.now()).slice(-4)}`;

// ---------- Narration script ----------
const LINES = {
  intro: `Meet the AI receptionist for ${BUSINESS_SPOKEN}, built by ${BRAND}. It lives on the ${PLACE}'s WhatsApp number, replies within seconds, day and night, and books appointments straight into the calendar. Let's take a look.`,
  login: `The team signs in to a simple dashboard. This is where every conversation, booking and setting lives.`,
  analytics: `Analytics shows the real numbers: conversations handled, bookings made by the AI, reminders sent, how often a human was needed, and how quickly ${WHO}s got a reply.`,
  demo: `Now the part that matters. This phone is a live WhatsApp conversation with the receptionist. Everything here is real: the bookings, reminders and handoffs all land in the dashboard.`,
  hello: `A new ${WHO}, ${FIRST}, messages the ${PLACE} for the first time.`,
  book: `${FIRST} asks for ${SERVICE}. Before offering a time, the receptionist asks the same questions your front desk would, and gathers everything it needs for the booking.`,
  availability: `It only offers times the calendar actually has free. Opening hours, ${PROVIDER} schedules, buffers and existing bookings are all taken into account.`,
  confirmTyped: `${FIRST} picks a time, and it's booked. The appointment is confirmed only after the calendar accepts it, so a double booking is impossible.`,
  confirm: `One tap, and it's booked. The appointment is confirmed only after the calendar accepts it, so a double booking is impossible.`,
  reminder: `Reminders go out automatically, twenty-four hours and two hours before the appointment. Here is the twenty-four hour reminder, sent now for the demo.`,
  confirmTap: `${FIRST} confirms with a single tap, and the ${PLACE} knows she is coming.`,
  reminder2: `Reminders go out automatically, twenty-four hours and two hours before the appointment. Here is the two hour reminder, sent now for the demo.`,
  confirmTap2: `${FIRST} replies with a single tap that she is on her way, and the ${PLACE} knows to expect her.`,
  faq: `Questions are answered from the ${PLACE}'s own FAQ: ${FAQ_TOPICS}.`,
  advice: `When a question is outside its remit, like ${ADVICE_TOPIC}, it does not guess. It gives a safe answer and offers a team member instead.`,
  handoff: `And if a ${WHO} asks for a person, the AI hands the chat over to the team and steps aside.`,
  inbox: `Staff see it in the inbox under Needs a human, read the full thread, and reply right here.`,
  handback: `When they are done, one click hands the conversation back to the AI.`,
  calendar: `Every booking lands in the calendar, per ${PROVIDER}, with reminders already attached. Switch between week and day views at any time.`,
  settings: `Everything the receptionist knows is configured here: services and prices, opening hours, FAQs, the tone of voice, and booking rules. No coding required.`,
  contacts: `Contacts keep a memory of every ${WHO}: name, preferences and visit history, so returning ${WHO}s are recognised.`,
  outro: `${BUSINESS_SPOKEN}, live on WhatsApp, with bookings, reminders, rescheduling and human handoff, all built by ${BRAND}. To get this on your own WhatsApp number, visit ${SITE.replace(/^www\./, "").replace(/\./g, " dot ")}, or email ${EMAIL.replace("@", " at ").replace(/\./g, " dot ")}. Thanks for watching.`,
};

// ---------- Voice-over generation ----------
const audio = {}; // key -> { file, duration }
function hasBin(name) {
  try { execSync(`command -v ${name}`, { stdio: "ignore" }); return true; } catch { return false; }
}
const HAS_TTS = hasBin("edge-tts");
const HAS_FFMPEG = hasBin("ffmpeg") && hasBin("ffprobe");
async function synthesize() {
  if (!HAS_TTS || !HAS_FFMPEG) {
    console.warn("edge-tts or ffmpeg not found: recording without voice-over");
    return;
  }
  const { spawn } = await import("node:child_process");
  const one = (key) =>
    new Promise((resolve, reject) => {
      const file = path.join(WORK, `${key}.mp3`);
      const child = spawn("edge-tts", ["--voice", VOICE, "--rate", VOICE_RATE, "--text", LINES[key], "--write-media", file], { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      child.stderr.on("data", (d) => (err += d));
      child.on("exit", (code) => {
        if (code !== 0) return reject(new Error(`edge-tts failed for ${key}: ${err}`));
        const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
        audio[key] = { file, duration };
        resolve();
      });
    });
  const keys = Object.keys(LINES);
  for (let i = 0; i < keys.length; i += 4) await Promise.all(keys.slice(i, i + 4).map(one));
  console.log(`voice-over: ${keys.length} clips, ${Object.values(audio).reduce((s, a) => s + a.duration, 0).toFixed(0)}s total (${VOICE} ${VOICE_RATE})`);
}
await synthesize();

// ---------- Browser ----------
const browser = await chromium.launch({ channel: "chrome", headless: true, args: INSECURE ? ["--disable-web-security"] : [] });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
// Presentation layer re-created on every page load: zoom, footer, caption slot, hidden dev overlay.
await context.addInitScript(({ brand, site, email }) => {
  const install = () => {
    if (document.getElementById("__ar_style")) return;
    const style = document.createElement("style");
    style.id = "__ar_style";
    style.textContent = `
      html { zoom: 1.3333; }
      body { padding-bottom: 46px !important; }
      nextjs-portal { display: none !important; }
      #__footer { position: fixed; left: 0; right: 0; bottom: 0; height: 46px; z-index: 99998; display: flex; align-items: center;
        justify-content: space-between; padding: 0 28px; background: #0b1220; color: #e2e8f0; font: 500 15px/1 -apple-system, Inter, "Segoe UI", sans-serif;
        letter-spacing: .01em; border-top: 1px solid rgba(255,255,255,.08); pointer-events: none; }
      #__footer .mark { display: inline-flex; align-items: center; gap: 10px; }
      #__footer .k { display: inline-flex; width: 26px; height: 26px; border-radius: 7px; background: linear-gradient(135deg,#10b981,#0f766e); color: #fff;
        font-weight: 800; font-size: 15px; align-items: center; justify-content: center; }
      #__footer .muted { color: #94a3b8; font-weight: 500; }
      #__footer b { color: #fff; font-weight: 700; }
      #__footer .sep { color: #475569; margin: 0 14px; }
      #__cap { position: fixed; left: 50%; bottom: 68px; transform: translateX(-50%); z-index: 99997; background: rgba(15,23,42,.94); color: #fff;
        padding: 16px 26px; border-radius: 16px; font: 600 22px/1.3 -apple-system, Inter, "Segoe UI", sans-serif; box-shadow: 0 12px 34px rgba(0,0,0,.35);
        max-width: 1120px; text-align: center; transition: opacity .3s; pointer-events: none; opacity: 0; }
      #__cap.tr { left: auto; right: 34px; bottom: auto; top: 78px; transform: none; max-width: 640px; text-align: left; font-size: 20px; }
      #__cap.br { left: auto; right: 34px; bottom: 62px; transform: none; max-width: 318px; text-align: left; font-size: 18px; padding: 14px 18px; }
      #__cap.br small { font-size: 14px; }
      #__cap small { display: block; font-size: 16px; font-weight: 500; opacity: .82; margin-top: 6px; }
      #__card { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
        color: #fff; font-family: -apple-system, Inter, "Segoe UI", sans-serif; background: radial-gradient(1200px 700px at 30% 20%, #134e4a 0%, #0b1220 55%, #020617 100%);
        transition: opacity .6s; pointer-events: none; }
      #__card .eyebrow { font-size: 18px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: #6ee7b7; margin-bottom: 18px; }
      #__card h1 { font-size: 64px; font-weight: 800; margin: 0 0 14px; letter-spacing: -.02em; }
      #__card h2 { font-size: 28px; font-weight: 500; margin: 0 0 34px; color: #cbd5e1; }
      #__card .pill { display: inline-flex; align-items: center; gap: 12px; padding: 12px 22px; border-radius: 999px; background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.14); font-size: 20px; font-weight: 600; }
      #__card .pill .k { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg,#10b981,#0f766e); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; }
      #__card .contact { margin-top: 30px; font-size: 24px; color: #e2e8f0; display: flex; gap: 40px; }
      #__card .contact b { color: #6ee7b7; font-weight: 700; }
    `;
    document.head.appendChild(style);
    const footer = document.createElement("div");
    footer.id = "__footer";
    footer.innerHTML = `<span class="mark"><span class="k">K</span><span><span class="muted">Built by</span> <b>${brand}</b></span></span>` +
      `<span><span class="muted">AI Receptionist for WhatsApp</span></span>` +
      `<span><b>${site}</b><span class="sep">|</span><b>${email}</b></span>`;
    document.body.appendChild(footer);
    const cap = document.createElement("div");
    cap.id = "__cap";
    document.body.appendChild(cap);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
}, { brand: BRAND, site: SITE, email: EMAIL });

// Warm up: the dev server compiles each route on first visit, which would show up as dead time in the video.
{
  const warm = await browser.newContext({ viewport: { width: 1440, height: 810 } });
  const w = await warm.newPage();
  await w.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await w.fill("#email", LOGIN);
  await w.fill("#password", PASSWORD);
  await w.getByRole("button", { name: /sign in|log in/i }).click();
  await w.waitForURL(/\/o\//, { timeout: 60000 });
  const id = w.url().match(/\/o\/([^/]+)/)[1];
  for (const route of ["analytics", "demo", "inbox", "calendar", "settings", "contacts"]) await w.goto(`${WEB}/o/${id}/${route}`, { waitUntil: "networkidle" });
  await warm.close();
}

const page = await context.newPage();
const t0 = Date.now();
let trimAt = 0; // ms from t0 where the final video starts (the title card), everything before is cut
page.setDefaultTimeout(25000);

// ---------- Helpers ----------
const wait = (ms) => page.waitForTimeout(ms);
const cues = []; // { key, at (ms from t0) }
let narrationEnds = 0; // ms from t0 when the current clip finishes
let currentCaption = null;

async function showCaption(text, sub = "") {
  currentCaption = text ? [text, sub] : null;
  await page.evaluate(([t, s]) => {
    const el = document.getElementById("__cap");
    if (!el) return;
    if (!t) { el.style.opacity = "0"; return; }
    el.innerHTML = `<div>${t}</div>${s ? `<small>${s}</small>` : ""}`;
    el.className = /\/demo(\?|$)/.test(location.pathname) ? "tr" : /\/inbox(\?|$)/.test(location.pathname) ? "br" : "";
    el.style.opacity = "1";
  }, currentCaption ?? [null, ""]);
}
/** Wait until the current narration clip has finished (plus a short breath). */
async function settle(extra = 350) {
  const remaining = narrationEnds - (Date.now() - t0);
  if (remaining > 0) await wait(remaining);
  if (extra) await wait(extra);
}
/** Show a caption and start its narration clip; clips never overlap. */
async function narrate(key, caption, sub = "") {
  await settle(150);
  const at = Date.now() - t0;
  console.log(new Date().toISOString().slice(11, 19), `[${(at / 1000).toFixed(1)}s]`, key);
  cues.push({ key, at });
  narrationEnds = at + (audio[key]?.duration ?? 3) * 1000;
  await showCaption(caption, sub);
}
async function go(url) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout: 8000 }).catch(() => {});
  if (currentCaption) await showCaption(...currentCaption);
}
async function typeFast(locator, text) {
  await locator.click();
  await locator.pressSequentially(text, { delay: 24 });
}
async function waitForReply() {
  await wait(500);
  await page.waitForFunction(() => !document.querySelector(".animate-bounce"), null, { timeout: 45000 });
  await wait(700);
}
async function say(text) {
  const input = page.getByLabel("Message");
  await typeFast(input, text);
  await wait(250);
  await input.press("Enter");
  await waitForReply();
}
async function tap(name) {
  const btn = page.locator(LAST_BUBBLE).last().getByRole("button", { name, exact: false }).last();
  await btn.scrollIntoViewIfNeeded();
  await wait(350);
  await btn.click();
  await waitForReply();
}
const lastBubbleRaw = () =>
  page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll("p.whitespace-pre-wrap"));
    return (ps[ps.length - 1]?.textContent ?? "").replace(/\s+/g, " ");
  });
const lastBubble = async () => (await lastBubbleRaw()).toLowerCase();
const bookedAlready = async () => !(await page.evaluate(() => document.body.innerText.includes("None yet. Book an appointment")));
// Times listed in plain text, e.g. "Thu 10 Sep, 10:00" or "Thu Sep 10 10:00".
const LISTED_RE = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? (?:\d{1,2} [A-Z][a-z]{2,8}|[A-Z][a-z]{2,8} \d{1,2})(?:,| at)? \d{1,2}:\d{2}\b/g;
// Only the newest bubble's buttons count: earlier bubbles keep theirs on screen after they were answered.
const LAST_BUBBLE = "div.max-w-\\[85\\%\\]";
const newestButtons = async () => {
  const quick = page.locator(LAST_BUBBLE).last().locator("button[data-quick-reply]");
  const n = await quick.count();
  const titles = [];
  for (let k = 0; k < n; k++) titles.push(((await quick.nth(k).textContent()) ?? "").trim());
  return titles;
};
const TIME_RE = /\b\d{1,2}([:.]\d{2})?\s?(am|pm)\b|\b\d{1,2}:\d{2}\b/i;
const slotButtons = () => page.locator(LAST_BUBBLE).last().locator("button[data-quick-reply]").filter({ hasText: TIME_RE });
const hasSlotButtons = async () => (await page.locator('button[data-quick-reply^="slot:"]').count()) > 0 || (await slotButtons().count()) > 0;
/** Keep the phone fully in view (the page header scrolls away) so the whole conversation is visible. */
async function framePhone() {
  await page.evaluate(() => {
    const phone = document.querySelector("div.max-w-\\[400px\\]");
    if (phone) window.scrollTo({ top: phone.getBoundingClientRect().top + window.scrollY - 76, behavior: "instant" });
  });
}
async function card(html) {
  await page.evaluate((h) => {
    let el = document.getElementById("__card");
    if (!h) { if (el) el.style.opacity = "0"; return; }
    if (!el) { el = document.createElement("div"); el.id = "__card"; el.style.opacity = "0"; document.body.appendChild(el); }
    el.innerHTML = h;
    requestAnimationFrame(() => { el.style.opacity = "1"; });
  }, html);
}

try {
  // ---------- Title card ----------
  await go(`${WEB}/login`);
  await card(`<div class="eyebrow">AI Receptionist for WhatsApp</div><h1>${BUSINESS}</h1><h2>Bookings, reminders and answers. 24 hours a day, on WhatsApp.</h2>` +
    `<div class="pill"><span class="k">K</span>Built by ${BRAND}</div>`);
  await wait(700);
  trimAt = Math.max(0, Date.now() - t0 - 900);
  await narrate("intro");
  await settle(400);
  await card(null);
  await wait(700);

  // ---------- Login ----------
  await narrate("login", `Sign in to the ${BUSINESS} dashboard`);
  await typeFast(page.locator("#email"), LOGIN);
  await typeFast(page.locator("#password"), PASSWORD);
  await wait(250);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/o\//, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  const orgId = page.url().match(/\/o\/([^/]+)/)[1];
  await settle();

  // ---------- Analytics ----------
  await narrate("analytics", "Analytics: real numbers from real conversations", "Conversations · bookings made by the AI · reminders · handoff rate · response time");
  await go(`${WEB}/o/${orgId}/analytics`);
  await settle(600);

  // ---------- Demo chat: booking ----------
  await narrate("demo", "A live WhatsApp conversation with the receptionist", "Everything here is real: bookings, reminders and handoffs land in the dashboard");
  await go(`${WEB}/o/${orgId}/demo`);
  await wait(600);
  const phoneInput = page.getByPlaceholder("+1 555 010 2000");
  await phoneInput.fill("");
  await phoneInput.fill(PHONE);
  await page.getByPlaceholder("Demo Customer").fill(CUSTOMER);
  await wait(400);
  await framePhone();
  await settle();

  await narrate("hello", `A new ${WHO} messages the ${PLACE} on WhatsApp`);
  await say("Hi");
  await narrate("book", `${FIRST} wants to book. The receptionist qualifies her first`, `Questions come from the ${PLACE}'s vertical pack`);
  await say(BOOK_TEXT);
  // Advance through whatever the receptionist asks (qualification, name, day, time) until it offers slots.
  const orgRow = await page.request.get(`${API}/orgs/${orgId}`).then((r) => r.json()).catch(() => null);
  const tz = orgRow?.timezone ?? "UTC";
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  const availabilityLine = () => narrate("availability", "It only offers times the calendar actually has free", `Opening hours, ${PROVIDER} schedules, buffers and existing bookings`);
  let askedForDay = false;
  for (let i = 0; i < 10 && !(await hasSlotButtons()) && !(await bookedAlready()); i++) {
    const raw = await lastBubbleRaw();
    const last = raw.toLowerCase();
    const listed = raw.match(LISTED_RE);
    if (listed?.length) {
      // Openings given in words: reply with one of them (prefer a later day so the 24h reminder can be sent).
      if (!askedForDay) { askedForDay = true; await availabilityLine(); await settle(); }
      await narrate("confirmTyped", `${FIRST} picks a time. Confirmed only after the calendar accepts it`, "Double-booking is impossible at the database level");
      await say(`${listed.find((x) => !x.startsWith(todayName)) ?? listed[0]} please`);
      continue;
    }
    const titles = await newestButtons();
    const pick = (re) => titles.find((t) => re.test(t));
    // Tap a matching quick reply when the assistant offered one, otherwise type the answer.
    const answer = async (re, text) => { const t = pick(re); if (t) await tap(t); else await say(text); };
    if (/your name|what name|who am i booking|name for the booking|full name/.test(last)) { await say(CUSTOMER); continue; }
    if (/remov|soak|currently have|existing (gel|set|polish|dip)|bare nails|need(s)? removing/.test(last)) { await answer(/^no\b/i, "No, bare nails"); continue; }
    if (/just (be |for )?you|others joining|anyone (else )?joining|with friends|bring(ing)? (anyone|friends|someone)|how many (people|of you|guests)|group|party/.test(last)) { await answer(/just me/i, "Just me"); continue; }
    if (/(favourite|favorite|preferred|particular|specific) (nail )?(technician|artist|dentist|stylist|therapist|provider|doctor|vet)|anyone (is )?fine|who would you like|prefer to see|new (patient|client)|been (here|with us|to us) before|first (visit|time)/.test(last)) {
      await answer(/anyone|no preference|first available|new (patient|client)|first (visit|time)|^no\b/i, "Anyone is fine");
      continue;
    }
    if (/which day|what day|when would you like|when suits|day suits|another day|what time|time of day|morning or afternoon|prefer.*(morning|afternoon|day|time)|day and time|date and time/.test(last)) {
      if (!askedForDay) { askedForDay = true; await availabilityLine(); }
      await answer(/this week|tomorrow|next week/i, "Thursday or Friday, any morning is fine");
      continue;
    }
    if (titles.length) { await tap(titles[titles.length - 1]); continue; }
    await say("Anything is fine, whatever is easiest");
  }
  if (!(await bookedAlready())) {
    if (!askedForDay) await availabilityLine();
    await wait(600);
    await narrate("confirm", "One tap books it. Confirmed only after the calendar accepts it", "Double-booking is impossible at the database level");
    const slots = (await page.locator('button[data-quick-reply^="slot:"]').count()) ? page.locator('button[data-quick-reply^="slot:"]') : slotButtons();
    let slot = slots.first();
    for (let k = 0, n = await slots.count(); k < n; k++) {
      const title = (await slots.nth(k).textContent()) ?? "";
      if (!title.startsWith(todayName)) { slot = slots.nth(k); break; }
    }
    await slot.scrollIntoViewIfNeeded();
    await wait(300);
    await slot.click();
    await waitForReply();
  }
  await settle(500);
  // "Thu 10 Sep, 10:00" in the bookings panel -> how many days from today (in the org's timezone).
  const org = orgRow;
  const bookingDays = await page.evaluate(() => {
    const all = document.body.innerText;
    const panel = all.slice(Math.max(0, all.search(/bookings made in this chat/i)));
    const m = panel.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
    return m ? { day: Number(m[1]), month: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(m[2]) } : null;
  });
  let daysAhead = 7;
  if (bookingDays) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: org?.timezone ?? "UTC" }));
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    let target = Date.UTC(now.getFullYear(), bookingDays.month, bookingDays.day);
    if (target < today) target = Date.UTC(now.getFullYear() + 1, bookingDays.month, bookingDays.day);
    daysAhead = Math.round((target - today) / 86400000);
  }
  const todayWeekday = (() => { const n = new Date(new Date().toLocaleString("en-US", { timeZone: org?.timezone ?? "UTC" })); return (n.getDay() + 6) % 7; })(); // Mon=0
  const weeksAhead = Math.floor((todayWeekday + daysAhead) / 7);

  // ---------- Reminder ----------
  await narrate("reminder", "Reminders go out 24h and 2h before, automatically", "Here is the 24h reminder, sent now for the demo");
  const reminderBubbles = () => page.locator(LAST_BUBBLE).filter({ hasText: /automated message/i }).count();
  const before = await reminderBubbles();
  const remind = page.getByRole("button", { name: "Send 24h reminder now" }).first();
  await remind.scrollIntoViewIfNeeded();
  await remind.click();
  let twoHour = false;
  await page.waitForFunction((n) => document.querySelectorAll("div.max-w-\\[85\\%\\]").length > n, before, { timeout: 6000 }).catch(() => { twoHour = true; });
  if (twoHour) {
    // Appointment is within 24h: send the 2h reminder instead and re-voice the step to match.
    await narrate("reminder2", "Reminders go out 24h and 2h before, automatically", "Here is the 2h reminder, sent now for the demo");
    await page.getByRole("button", { name: "Send 2h reminder now" }).first().click();
    await wait(2000);
  }
  await wait(1200);
  await framePhone();
  await settle();
  await narrate(twoHour ? "confirmTap2" : "confirmTap", `${FIRST} confirms with one tap`);
  await tap(twoHour ? "On my way" : "Yes, I'll be there");
  await settle();

  // ---------- FAQ + honesty ----------
  await narrate("faq", `Questions are answered from the ${PLACE}'s own FAQ`);
  await say(FAQ_TEXT);
  await settle();
  await narrate("advice", "Questions outside its remit are declined, not guessed", "Vertical compliance rules: no medical advice, no promises");
  await say(ADVICE_TEXT);
  await settle();

  // ---------- Handoff ----------
  await narrate("handoff", "Asking for a person hands the chat to the team and pauses the AI");
  await say("Can I speak to a real person please?");
  await settle();

  // ---------- Inbox ----------
  await narrate("inbox", "Staff see it in the Inbox under “Needs a human” and reply from here");
  await go(`${WEB}/o/${orgId}/inbox`);
  await wait(800);
  await page.getByRole("button", { name: /Needs a human/i }).first().click().catch(() => {});
  await wait(700);
  await page.getByRole("button", { name: new RegExp(CUSTOMER) }).first().click();
  await wait(1200);
  const composer = page.getByPlaceholder(/Write a reply/);
  await typeFast(composer, `Hi ${FIRST}, this is Jo from the front desk. Of course, how can I help?`);
  await composer.press("Enter");
  await settle(600);
  await narrate("handback", "When they are done, one click hands the conversation back to the AI");
  await page.getByRole("button", { name: "Hand back to AI" }).click();
  await settle(400);

  // ---------- Calendar ----------
  await narrate("calendar", `Every booking lands in the calendar, per ${PROVIDER}, with reminders attached`);
  await go(`${WEB}/o/${orgId}/calendar`);
  await page.getByRole("button", { name: "Today", exact: true }).waitFor();
  const next = page.getByRole("button", { name: "Next", exact: true });
  for (let i = 0; i < weeksAhead; i++) { await next.click(); await wait(900); }
  await wait(1500);
  // Day view, stepped forward until the header shows the booking's date.
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await wait(900);
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const onTarget = () => page.evaluate(([d, m]) => new RegExp(`\\b${d} ${m}\\b`).test(document.body.innerText), [bookingDays?.day ?? -1, MONTHS[bookingDays?.month ?? 0]]);
  for (let i = 0; i < 14 && bookingDays && !(await onTarget()); i++) { await next.click(); await wait(450); }
  await wait(2600);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await wait(1500);
  await settle(300);

  // ---------- Settings ----------
  await narrate("settings", "Everything the receptionist knows is configured here", "Services · hours · FAQs · tone of voice · booking rules");
  await go(`${WEB}/o/${orgId}/settings`);
  await wait(1200);
  for (const tab of ["Services", "FAQs", "Brand voice", "Booking rules"]) {
    const t = page.getByRole("tab", { name: tab }).first();
    if (await t.count()) { await t.click(); await wait(1500); }
  }
  await settle(200);

  // ---------- Contacts ----------
  await narrate("contacts", "Contacts keep memory across conversations: name, preferences, history");
  await go(`${WEB}/o/${orgId}/contacts`);
  await settle(500);

  // ---------- Closing card ----------
  await go(`${WEB}/o/${orgId}/demo`);
  await framePhone();
  await showCaption(null);
  await card(`<div class="eyebrow">Ready for your WhatsApp number</div><h1>${BUSINESS}</h1><h2>Bookings · Reminders · Rescheduling · Human handoff · Analytics</h2>` +
    `<div class="pill"><span class="k">K</span>Built by ${BRAND}</div>` +
    `<div class="contact"><span><b>Web</b> ${SITE}</span><span><b>Email</b> ${EMAIL}</span></div>`);
  await wait(500);
  await narrate("outro");
  await settle(1500);
} catch (e) {
  console.error("SCRIPT ERROR:", e);
  const transcript = await page.evaluate(() => Array.from(document.querySelectorAll("p.whitespace-pre-wrap")).map((p) => p.textContent?.replace(/\s+/g, " ").trim())).catch(() => []);
  if (transcript.length) console.error("TRANSCRIPT:\n - " + transcript.join("\n - "));
  await page.screenshot({ path: path.join(OUT, "error.png") }).catch(() => {});
  await showCaption("(recording stopped)").catch(() => {});
  await wait(500);
} finally {
  const elapsed = Date.now() - t0;
  // Leave the business as we found it: remove the demo customer created by this recording.
  const orgId = page.url().match(/\/o\/([^/]+)/)?.[1];
  if (orgId && !process.env.RECORD_KEEP) await page.request.post(`${API}/orgs/${orgId}/simulator/reset`, { data: { phoneE164: PHONE } }).catch(() => {});
  await context.close();
  await browser.close();
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".webm"));
  const webm = files[0] ? path.join(OUT, files[0]) : null;
  if (webm && HAS_FFMPEG) {
    const mp4 = path.join(OUT, `${OUT_NAME}.mp4`);
    const videoDuration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", webm]).toString().trim()) || elapsed / 1000;
    // The screencast starts slightly before t0; shift every cue by the difference so audio lines up with the captions.
    const shift = Math.max(0, videoDuration * 1000 - elapsed);
    const cut = trimAt + shift; // ms of raw video to drop from the start
    const outDuration = videoDuration - cut / 1000;
    const clips = cues.filter((c) => audio[c.key]);
    const args = ["-v", "error", "-y", "-ss", (cut / 1000).toFixed(3), "-i", webm];
    let filter = "";
    if (clips.length) {
      clips.forEach((c) => args.push("-i", audio[c.key].file));
      filter = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.max(0, Math.round(c.at + shift - cut))}:all=1[a${i}]`).join(";") +
        `;${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad=whole_dur=${outDuration.toFixed(3)}[a]`;
      args.push("-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-c:a", "aac", "-b:a", "160k");
    } else {
      args.push("-map", "0:v");
    }
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", "-t", outDuration.toFixed(3), mp4);
    execFileSync("ffmpeg", args, { stdio: "inherit" });
    fs.unlinkSync(webm);
    fs.rmSync(WORK, { recursive: true, force: true });
    console.log(`video: ${mp4} (${outDuration.toFixed(0)}s, ${clips.length} narration clips, cut ${cut.toFixed(0)}ms from the start)`);
  } else if (webm) {
    console.log("video (ffmpeg not found, keeping WebM):", webm);
  }
}
