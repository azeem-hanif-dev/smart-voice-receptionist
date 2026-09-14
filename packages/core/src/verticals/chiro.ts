import type { VerticalPack } from "./types.js";
import { baseTemplates } from "./shared-templates.js";

const WEEKDAYS: [number, number, number][] = [1, 2, 3, 4, 5].map((d) => [d, 480, 1080]);

export const chiroPack: VerticalPack = {
  id: "CHIRO",
  displayName: "Chiropractic clinic",
  tagline: "Initial consultations and adjustments for a chiropractor.",
  vocabulary: {
    customer: "patient",
    customerPlural: "patients",
    provider: "chiropractor",
    providerPlural: "chiropractors",
    appointment: "appointment",
    business: "clinic",
  },
  defaultServices: [
    { name: "New patient consultation", durationMinutes: 45, bufferAfterMinutes: 5, priceCents: 9500, description: "History, examination and first adjustment if appropriate." },
    { name: "Adjustment", durationMinutes: 15, bufferAfterMinutes: 5, priceCents: 5500, description: "Standard follow-up adjustment." },
    { name: "Extended adjustment", durationMinutes: 30, bufferAfterMinutes: 5, priceCents: 8000 },
    { name: "Re-examination", durationMinutes: 30, priceCents: 7000 },
  ],
  defaultHours: [...WEEKDAYS, [6, 480, 720]],
  qualificationQuestions: [
    { id: "returning", prompt: "Are you a new patient, or have you seen us before?", ask: "Whether they are a new patient (new patient consultation) or existing (adjustment).", when: "always", options: ["New patient", "Existing patient"] },
    { id: "concern", prompt: "What's the main thing you'd like help with?", ask: "The main area of concern (neck, back, headaches, etc.) in one sentence.", when: "always" },
    { id: "xray", prompt: "Do you have any recent X-rays or scans you could bring?", ask: "Whether they have recent X-rays or scans they can bring.", when: "new_customer", options: ["Yes", "No"] },
  ],
  faqSeeds: [
    { question: "What happens at the first visit?", answer: "The first visit is 45 minutes: a health history, physical examination and, if appropriate, your first adjustment. Wear comfortable clothing.", keywords: ["first", "visit", "expect", "initial"] },
    { question: "Do you accept insurance?", answer: "Yes, most health insurance plans cover chiropractic care. Bring your card and we can claim on the spot for major funds.", keywords: ["insurance", "cover", "claim", "fund"] },
    { question: "Do I need a referral?", answer: "No referral is required.", keywords: ["referral", "doctor"] },
    { question: "Is there parking?", answer: "Free parking is available on site.", keywords: ["parking", "park"] },
  ],
  toneGuidance: "Friendly, confident and practical. Keep it brief; patients often message between meetings.",
  complianceRules: [
    "Never give clinical advice, a diagnosis, or comment on whether treatment is appropriate for a symptom.",
    "Never promise pain relief or outcomes.",
    "Only quote listed prices.",
  ],
  emergencyMessage: "If you have sudden severe headache, loss of feeling, weakness, loss of bladder or bowel control, or chest pain, please seek urgent medical care now. I have alerted our team.",
  escalationTriggers: [
    { pattern: "(loss of|lost|losing|no) (feeling|bladder control|bowel control)|can'?t feel my (legs?|arms?|feet|hands?) (since|after|any ?more|at all)|sudden(ly)? (weak|numb|can'?t)|worst headache|chest pains?|(just|today|yesterday|this morning|last night) (had|been in|was in) (a|an) (car |road )?(accident|crash|collision)|(had|been in|was in) (a|an) (car |road )?(accident|crash|collision) (today|yesterday|this morning|last night|just now|an hour ago|earlier)", reason: "Possible urgent condition", urgency: "high", emergency: true },
    { pattern: "make a complaint|\\bcomplaint\\b|(want|demand|need|like) (a |my )?refund|(you|he|she|they) (injured|hurt) me", reason: "Complaint or adverse event", urgency: "high" },
  ],
  reminderTemplates: baseTemplates({
    appointment: "appointment",
    business: "clinic",
    rebookLine: "it's been a while since your last adjustment. Would you like to book a maintenance visit?",
  }),
  followUp: { rebookAfterDays: 30, noShowFollowUpMinutes: 45 },
  sampleCustomerMessages: ["I have lower back pain, can I book an adjustment?", "What happens at the first visit?", "Cancel my appointment please"],
};
