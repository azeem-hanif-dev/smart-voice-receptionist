import type { VerticalPack } from "./types.js";
import { baseTemplates } from "./shared-templates.js";

/** Nail salon / nail spa. Menu shape follows a typical mani-pedi studio: packages plus individual treatments. */
export const nailSpaPack: VerticalPack = {
  id: "NAILSPA",
  displayName: "Nail spa",
  tagline: "Manicures, pedicures, gel, extensions and spa packages for a nail studio.",
  vocabulary: {
    customer: "client",
    customerPlural: "clients",
    provider: "nail technician",
    providerPlural: "nail technicians",
    appointment: "appointment",
    business: "spa",
  },
  defaultServices: [
    { name: "Regular Manicure", durationMinutes: 30, bufferAfterMinutes: 5, priceCents: 2500, description: "Nail shaping, cuticle care, hand massage and polish." },
    { name: "Gel Manicure", durationMinutes: 45, bufferAfterMinutes: 5, priceCents: 4000, description: "Long-lasting gel colour, chip-free for weeks." },
    { name: "Regular Pedicure", durationMinutes: 35, bufferAfterMinutes: 5, priceCents: 2800, description: "Nail care, shaping, exfoliation, scrub, mask and a foot massage." },
    { name: "Spa Pedicure", durationMinutes: 50, bufferAfterMinutes: 10, priceCents: 4500, description: "Soak, hot stone, hot towel and a longer foot massage." },
    { name: "Mani + Pedi Combo", durationMinutes: 90, bufferAfterMinutes: 10, priceCents: 6000, description: "Regular manicure and pedicure with back and foot massage." },
    { name: "Nail Extensions", durationMinutes: 90, bufferAfterMinutes: 10, priceCents: 9000, description: "Acrylic or hard gel for added length and strength." },
    { name: "Gel Removal", durationMinutes: 15, priceCents: 1500, description: "Safe soak-off of gel or powder." },
  ],
  defaultHours: [[1, 600, 1170], [2, 600, 1170], [3, 600, 1170], [4, 600, 1170], [5, 600, 1170], [6, 600, 1170], [0, 600, 1080]],
  qualificationQuestions: [
    { id: "removal", prompt: "Do you currently have gel, powder or extensions on that need removing first?", ask: "Whether they have existing gel, dip powder or extensions to remove, so enough time is booked. Skip for pedicure-only visits.", when: "always", options: ["Yes, needs removal", "No"] },
    { id: "technician", prompt: "Do you have a favourite nail technician, or is anyone fine?", ask: "Whether they have a preferred nail technician or are happy with the first available.", when: "always" },
    { id: "groupSize", prompt: "Is this just for you, or are you coming with friends?", ask: "How many people are coming; groups of three or more should be handed to a team member to arrange.", when: "new_customer", options: ["Just me", "2 people", "3 or more"] },
  ],
  faqSeeds: [
    { question: "Do you take walk-ins?", answer: "Yes, walk-ins are welcome when we have a free chair, but booking ahead guarantees your time and your preferred technician.", keywords: ["walk in", "walk-in", "without booking", "same day"] },
    { question: "How long does a gel manicure last?", answer: "Gel polish usually lasts two to three weeks without chipping. We recommend a professional soak-off rather than peeling it to protect your natural nails.", keywords: ["gel", "last", "chip", "weeks"] },
    { question: "Do you remove gel or acrylics from another salon?", answer: "Yes. Removal is a separate 15 minute service; let us know when you book so we allow the time.", keywords: ["remove", "removal", "soak off", "acrylic", "another salon"] },
    { question: "Are your tools sanitised?", answer: "Every tool is sterilised between clients and stations are fully sanitised after each appointment. Files and buffers are single-use.", keywords: ["clean", "sanit", "steril", "hygiene", "safe"] },
    { question: "Is parking available?", answer: "There is free parking in front of the spa.", keywords: ["parking", "park", "car"] },
    { question: "Do you sell gift cards?", answer: "Yes, gift cards are available in any amount at the front desk.", keywords: ["gift", "voucher", "card"] },
    { question: "What is your cancellation policy?", answer: "Please give at least 24 hours' notice to cancel or move an appointment so we can offer the time to someone else.", keywords: ["cancel", "cancellation", "policy", "late", "reschedule"] },
    { question: "Can I bring my children?", answer: "Children are welcome for their own appointments. For safety we ask that young children are not left unattended in the spa.", keywords: ["child", "kids", "children", "daughter"] },
  ],
  toneGuidance: "Warm, calm and polished, like a luxury spa front desk. Use the client's name. Light emoji is fine if the client uses them first. Never rush.",
  complianceRules: [
    "Only quote prices that appear in the services list and say they are starting prices; nail art, length and removal can add to the total.",
    "Do not promise how long a set will last or that a treatment is suitable for a skin or nail condition; suggest the technician assesses at the appointment.",
    "For groups of three or more, or bridal parties, hand off to a team member to arrange.",
    "Do not give advice about infections, damaged nails or allergic reactions; suggest they see a doctor if worried.",
  ],
  emergencyMessage: "If you are having an allergic reaction with swelling or difficulty breathing, please seek urgent medical help now. I have alerted our team.",
  escalationTriggers: [
    { pattern: "allergic reaction|(fingers?|hands?|face|skin|lips?) (is|are) (swelling|swollen|burning|blistering)|can'?t breathe|difficulty breathing", reason: "Possible allergic reaction", urgency: "high", emergency: true },
    { pattern: "make a complaint|\\bcomplaint\\b|ruined my nails|(want|demand|need|like) (a |my )?refund|(awful|terrible|horrible|worst) (job|set|service|experience)", reason: "Unhappy client", urgency: "high" },
    { pattern: "bridal|\\bbride\\b|my wedding|wedding party|bachelorette|hen party|group of (3|4|5|6|7|8|9|three|four|five|six)", reason: "Group or bridal booking needs a team member", urgency: "normal" },
  ],
  reminderTemplates: baseTemplates({
    appointment: "appointment",
    business: "spa",
    rebookLine: "it's been about three weeks since your last visit, the perfect time for a fresh set.",
  }),
  followUp: { rebookAfterDays: 21, noShowFollowUpMinutes: 45 },
  sampleCustomerMessages: ["Hi, can I book a gel manicure this week?", "Do you do nail extensions?", "How much is a spa pedicure?"],
};
