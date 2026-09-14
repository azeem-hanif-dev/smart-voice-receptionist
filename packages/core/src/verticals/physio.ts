import type { VerticalPack } from "./types.js";
import { baseTemplates } from "./shared-templates.js";

const WEEKDAYS_7_TO_7: [number, number, number][] = [1, 2, 3, 4, 5].map((d) => [d, 420, 1140]);

export const physioPack: VerticalPack = {
  id: "PHYSIO",
  displayName: "Physiotherapy clinic",
  tagline: "Assessments and treatment sessions for a physio or sports-injury clinic.",
  vocabulary: {
    customer: "patient",
    customerPlural: "patients",
    provider: "physiotherapist",
    providerPlural: "physiotherapists",
    appointment: "session",
    business: "clinic",
  },
  defaultServices: [
    { name: "Initial assessment", durationMinutes: 60, bufferAfterMinutes: 5, priceCents: 11000, description: "First visit: history, examination and treatment plan." },
    { name: "Follow-up treatment", durationMinutes: 30, bufferAfterMinutes: 5, priceCents: 7500 },
    { name: "Extended treatment", durationMinutes: 45, bufferAfterMinutes: 5, priceCents: 9500 },
    { name: "Sports massage", durationMinutes: 45, bufferAfterMinutes: 10, priceCents: 8500 },
    { name: "Pilates rehab (1:1)", durationMinutes: 45, priceCents: 9000 },
  ],
  defaultHours: [...WEEKDAYS_7_TO_7, [6, 480, 780]],
  qualificationQuestions: [
    { id: "returning", prompt: "Are you a new patient, or have you seen us before?", ask: "Whether they are a new patient (needs an initial assessment) or an existing patient (follow-up).", when: "always", options: ["New patient", "Existing patient"] },
    { id: "area", prompt: "Which area is giving you trouble?", ask: "Which area of the body or injury they need help with, in one sentence, so the right physio is chosen.", when: "always" },
    { id: "referral", prompt: "Do you have a referral or an insurance claim?", ask: "Whether they have a referral or an insurance / workers' compensation claim.", when: "new_customer", options: ["No referral", "Doctor referral", "Insurance claim"] },
  ],
  faqSeeds: [
    { question: "Do I need a referral?", answer: "No referral is needed to see a physiotherapist. If you are claiming through insurance or a compensation scheme, bring the claim details.", keywords: ["referral", "gp", "doctor", "need"] },
    { question: "What should I wear?", answer: "Comfortable clothing that lets the physio see and move the area being treated, for example shorts for a knee problem.", keywords: ["wear", "clothes", "bring"] },
    { question: "How long is the first appointment?", answer: "The initial assessment is 60 minutes. Follow-ups are usually 30 minutes.", keywords: ["how long", "first", "initial", "duration"] },
    { question: "Do you accept health insurance?", answer: "Yes, most health funds cover physiotherapy. We can process claims on the spot for major funds.", keywords: ["insurance", "fund", "claim", "cover"] },
    { question: "Is there parking?", answer: "There is free parking in front of the clinic.", keywords: ["parking", "park"] },
  ],
  toneGuidance: "Encouraging and practical. Patients are often in pain or frustrated by an injury; be efficient and positive without overpromising recovery.",
  complianceRules: [
    "Never give exercise, treatment, diagnostic or medication advice. Do not comment on what an injury might be.",
    "Never promise recovery timelines or outcomes.",
    "Only quote listed prices.",
  ],
  emergencyMessage: "If you have a suspected fracture, loss of feeling or movement, severe pain after a fall, or chest pain, please seek urgent medical care now. I have alerted our team.",
  escalationTriggers: [
    { pattern: "(just|today|this morning|yesterday|think I(?:'ve| have)?) (broke|broken|fractured) (my|a|the)|suspected fracture|bone (is )?(sticking|poking) out|(sudden|suddenly) (numb|weak|can'?t feel|lost (the )?feeling)|can'?t feel my (legs?|arms?|feet|hands?) (since|after|any ?more|at all)|(lost|losing|no) (bladder|bowel) control|chest pains?|fell and can'?t (move|walk|get up|stand)", reason: "Possible urgent injury", urgency: "high", emergency: true },
    { pattern: "make a complaint|\\bcomplaint\\b|(want|demand|need|like) (a |my )?refund|(much |a lot |far )?worse (since|after) (my|the|your) (session|treatment|appointment|visit)", reason: "Complaint or adverse outcome", urgency: "high" },
  ],
  reminderTemplates: baseTemplates({
    appointment: "session",
    business: "clinic",
    rebookLine: "how is your recovery going? If you'd like a check-in session, I can find a time.",
  }),
  followUp: { rebookAfterDays: 21, noShowFollowUpMinutes: 60 },
  sampleCustomerMessages: ["I hurt my knee playing football, can I see someone?", "Do I need a referral?", "I want to move my session to next week"],
};
