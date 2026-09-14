import type { VerticalPack } from "./types.js";
import { baseTemplates } from "./shared-templates.js";

const WEEKDAYS_9_TO_5: [number, number, number][] = [1, 2, 3, 4, 5].map((d) => [d, 540, 1020]);

export const dentalPack: VerticalPack = {
  id: "DENTAL",
  displayName: "Dental practice",
  tagline: "Check-ups, cleanings, fillings and emergencies for a dental office.",
  vocabulary: {
    customer: "patient",
    customerPlural: "patients",
    provider: "dentist",
    providerPlural: "dentists",
    appointment: "appointment",
    business: "practice",
  },
  defaultServices: [
    { name: "Check-up & clean", durationMinutes: 45, bufferAfterMinutes: 10, priceCents: 12000, description: "Routine examination and hygienist clean." },
    { name: "Emergency / toothache", durationMinutes: 30, bufferAfterMinutes: 10, priceCents: 9500, description: "Same-day assessment for pain, swelling or a broken tooth." },
    { name: "Filling", durationMinutes: 60, bufferAfterMinutes: 10, priceCents: 18000, description: "Composite filling for one tooth." },
    { name: "Teeth whitening consultation", durationMinutes: 30, priceCents: 0, description: "Free consultation to plan whitening." },
    { name: "Child check-up", durationMinutes: 30, priceCents: 6000, description: "Examination for patients under 16." },
  ],
  defaultHours: [...WEEKDAYS_9_TO_5, [6, 540, 780]],
  qualificationQuestions: [
    { id: "returning", prompt: "Have you visited us before, or is this your first time?", ask: "Whether they have visited the practice before (new or returning patient).", when: "always", options: ["New patient", "Returning patient"] },
    { id: "reason", prompt: "What's the visit for? A routine check-up, some pain, or something else?", ask: "The reason for the visit, in their words (routine check-up, pain, cosmetic, etc.).", when: "always" },
    { id: "pain", prompt: "Sorry to hear that. How bad is the pain, and is there any swelling?", ask: "If they mention pain: how severe it is and whether there is swelling, so staff can prioritise. Do not diagnose.", when: "always" },
    { id: "insurance", prompt: "Do you have dental insurance you'd like to use?", ask: "Whether they have dental insurance they would like to use.", when: "new_customer", options: ["Yes", "No"] },
  ],
  faqSeeds: [
    { question: "Do you accept dental insurance?", answer: "Yes. We accept most major dental insurance plans. Bring your insurance card and we will check your coverage before treatment.", keywords: ["insurance", "cover", "plan"] },
    { question: "Is parking available?", answer: "There is free patient parking behind the building and street parking on the main road.", keywords: ["parking", "park", "car"] },
    { question: "How often should I have a check-up?", answer: "Most patients come every six months. Your dentist will recommend a schedule that suits you.", keywords: ["often", "how many", "six months", "frequency"] },
    { question: "Do you treat children?", answer: "Yes, we see children of all ages. Child check-ups are 30 minutes.", keywords: ["child", "kids", "children", "son", "daughter"] },
    { question: "What if I have a dental emergency?", answer: "Call us as soon as you can and we will fit you in the same day where possible. If you have severe swelling affecting breathing or swallowing, go to the emergency department.", keywords: ["emergency", "urgent", "broken", "knocked out"] },
    { question: "What payment methods do you take?", answer: "We accept cash, debit and all major credit cards. Payment is taken at the end of your visit.", keywords: ["pay", "payment", "card", "cash"] },
  ],
  toneGuidance: "Calm, reassuring and precise. Patients may be anxious about pain or cost; acknowledge that briefly and move to practical next steps.",
  complianceRules: [
    "Never give clinical, diagnostic or medication advice. Do not suggest what is wrong with a tooth or what treatment will be needed; the dentist decides that at the appointment.",
    "Never promise treatment outcomes, timelines or that something will be painless.",
    "Only quote prices that appear in the services list. If a price is not listed, say the practice will confirm it.",
    "Do not ask for or record detailed medical history over chat beyond what is needed to book.",
  ],
  emergencyMessage: "If you have severe facial swelling, difficulty breathing or swallowing, or uncontrolled bleeding, please go to the nearest emergency department or call emergency services now. I have also alerted our team.",
  escalationTriggers: [
    { pattern: "(can'?t|cannot|difficult(y)? to|struggling to|trouble) (breathe|breathing|swallow(ing)?)|(face|cheek|eye|throat|neck) (is|has) (swollen|swelling)|swelling (in|around|of) (my|the) (face|eye|throat|neck)|(bleeding|blood) (won'?t|will not|doesn'?t) stop|uncontroll(ed|able) bleeding|(just|today|this morning|an hour ago|last night) (got |been |was )?knocked out|knocked out (just now|today|this morning|an hour ago)", reason: "Possible dental emergency", urgency: "high", emergency: true },
    { pattern: "make a complaint|\\bcomplaint\\b|(want|demand|need|like) (a |my )?(full )?refund|(going to|gonna|will) (sue|complain)", reason: "Complaint or refund request", urgency: "high" },
  ],
  reminderTemplates: baseTemplates({
    appointment: "appointment",
    business: "practice",
    rebookLine: "it has been about six months since your last check-up and clean, so it's time for your next one.",
  }),
  followUp: { rebookAfterDays: 180, noShowFollowUpMinutes: 60 },
  sampleCustomerMessages: ["Hi, I'd like to book a check-up", "Do you take insurance?", "I have a toothache, can I come in today?"],
};
