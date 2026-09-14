import type { VerticalPack } from "./types.js";
import { baseTemplates } from "./shared-templates.js";

const WEEKDAYS_8_TO_6: [number, number, number][] = [1, 2, 3, 4, 5].map((d) => [d, 480, 1080]);

export const clinicPack: VerticalPack = {
  id: "CLINIC",
  displayName: "General clinic",
  tagline: "GP consultations, vaccinations and health checks for a family clinic.",
  vocabulary: {
    customer: "patient",
    customerPlural: "patients",
    provider: "doctor",
    providerPlural: "doctors",
    appointment: "appointment",
    business: "clinic",
  },
  defaultServices: [
    { name: "GP consultation", durationMinutes: 15, bufferAfterMinutes: 5, priceCents: 8000, description: "Standard consultation for one concern." },
    { name: "Extended consultation", durationMinutes: 30, bufferAfterMinutes: 5, priceCents: 14000, description: "For multiple concerns or complex issues." },
    { name: "Vaccination", durationMinutes: 15, priceCents: 4500, description: "Routine and travel vaccinations." },
    { name: "Annual health check", durationMinutes: 45, bufferAfterMinutes: 5, priceCents: 22000, description: "Full physical with blood pressure and basic bloods." },
    { name: "Telehealth consultation", durationMinutes: 15, priceCents: 7000, description: "Video call with a doctor." },
  ],
  defaultHours: [...WEEKDAYS_8_TO_6, [6, 540, 720]],
  qualificationQuestions: [
    { id: "returning", prompt: "Are you an existing patient with us, or new?", ask: "Whether they are an existing patient of the clinic.", when: "always", options: ["Existing patient", "New patient"] },
    { id: "reason", prompt: "What's the appointment for? Just a sentence is fine.", ask: "A brief reason for the visit so the right appointment length is booked. Do not probe for detail beyond one sentence.", when: "always" },
    { id: "who", prompt: "Is the appointment for you or for someone else?", ask: "Whether the appointment is for themselves or someone else (e.g. a child) and, if so, the patient's name.", when: "always" },
    { id: "dob", prompt: "As a new patient, could I get the patient's date of birth?", ask: "Date of birth of the patient, for new patients only.", when: "new_customer" },
  ],
  faqSeeds: [
    { question: "Do you take walk-ins?", answer: "We are appointment-based, but we keep a few same-day slots each morning. Message us early and we will do our best.", keywords: ["walk in", "walk-in", "same day", "today"] },
    { question: "Do you bulk bill / take insurance?", answer: "We accept most health insurance plans. Bring your card and photo ID to your first visit.", keywords: ["insurance", "bulk bill", "medicare", "cover"] },
    { question: "Can I get a repeat prescription without an appointment?", answer: "Repeat prescriptions need a short consultation so the doctor can review your record. A 15 minute appointment is enough.", keywords: ["prescription", "repeat", "script", "medication"] },
    { question: "Do you do blood tests?", answer: "Yes, blood samples are taken at the clinic Monday to Friday before 11am. Some tests require fasting; the doctor will tell you.", keywords: ["blood", "test", "pathology", "lab"] },
    { question: "Where are you located?", answer: "Our address and directions are in the business profile. There is parking at the rear.", keywords: ["where", "address", "location", "directions", "parking"] },
  ],
  toneGuidance: "Warm, efficient and discreet. Keep health details to the minimum needed to book. Never sound alarmed.",
  complianceRules: [
    "Never provide medical advice, a diagnosis, or comment on symptoms, medications or test results. Book an appointment or escalate instead.",
    "Never promise outcomes or that a specific doctor will prescribe something.",
    "Treat everything the patient shares as confidential; do not repeat health details back unnecessarily.",
    "If the patient describes symptoms that sound urgent (chest pain, difficulty breathing, stroke signs, severe bleeding, suicidal thoughts), direct them to emergency services first, then hand off.",
  ],
  emergencyMessage: "This sounds like it may need urgent care. Please call emergency services or go to the nearest emergency department right away. I have alerted our team as well.",
  escalationTriggers: [
    { pattern: "chest pains?|can'?t breathe|difficulty breathing|struggling to breathe|(having|may be having|might be having|signs of|symptoms of) a stroke|stroke (right now|symptoms)|(is|are|am) unconscious|passed out|overdos(e|ed)|suicid|kill myself|end my life|severe bleeding|bleeding heavily|(having|had) a seizure (now|today|just|this morning)|seizing", reason: "Possible medical emergency", urgency: "high", emergency: true },
    { pattern: "make a complaint|\\bcomplaint\\b|(want|demand|need|like) (a |my )?refund|(going to|gonna|will) (sue|complain)|malpractice", reason: "Complaint", urgency: "high" },
    { pattern: "test results?|blood results?|my results", reason: "Results request (must be handled by staff)", urgency: "normal" },
  ],
  reminderTemplates: baseTemplates({
    appointment: "appointment",
    business: "clinic",
    rebookLine: "it's been a year since your last health check. Would you like to book your annual check-up?",
  }),
  followUp: { rebookAfterDays: 365, noShowFollowUpMinutes: 60 },
  sampleCustomerMessages: ["I need to see a doctor this week", "Can I get a flu shot?", "Do you take walk-ins?"],
};
