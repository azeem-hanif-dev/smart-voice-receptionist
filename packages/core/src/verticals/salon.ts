import type { VerticalPack } from "./types.js";
import { baseTemplates } from "./shared-templates.js";

export const salonPack: VerticalPack = {
  id: "SALON",
  displayName: "Hair & beauty salon",
  tagline: "Cuts, colour, styling and treatments for a salon.",
  vocabulary: {
    customer: "client",
    customerPlural: "clients",
    provider: "stylist",
    providerPlural: "stylists",
    appointment: "appointment",
    business: "salon",
  },
  defaultServices: [
    { name: "Women's cut & blow dry", durationMinutes: 60, bufferAfterMinutes: 10, priceCents: 6500 },
    { name: "Men's cut", durationMinutes: 30, bufferAfterMinutes: 5, priceCents: 3500 },
    { name: "Full colour", durationMinutes: 120, bufferAfterMinutes: 15, priceCents: 12000, description: "Root to tip single colour, includes blow dry." },
    { name: "Highlights / balayage", durationMinutes: 150, bufferAfterMinutes: 15, priceCents: 16000 },
    { name: "Blow dry", durationMinutes: 30, priceCents: 3000 },
    { name: "Keratin treatment", durationMinutes: 120, bufferAfterMinutes: 15, priceCents: 20000 },
  ],
  defaultHours: [[2, 600, 1140], [3, 600, 1140], [4, 600, 1200], [5, 600, 1200], [6, 540, 1080]],
  qualificationQuestions: [
    { id: "colourHistory", prompt: "Have you had colour with us before, or is this your first colour appointment?", ask: "For colour services only: whether they have had colour with the salon before (affects patch test and timing). Skip for cuts and blow dries.", when: "always", options: ["First colour here", "Had colour here before"] },
    { id: "stylist", prompt: "Do you have a preferred stylist, or is anyone fine?", ask: "Whether they have a preferred stylist or are happy with anyone available.", when: "always" },
    { id: "patchTest", prompt: "For a first colour with us you'll need a quick patch test at least 48 hours before. Shall I book that too?", ask: "For first-time colour clients: they need a patch test at least 48 hours before the colour appointment. Offer to book it.", when: "new_customer" },
  ],
  faqSeeds: [
    { question: "Do I need a patch test for colour?", answer: "Yes, if you are new to us or have not had colour with us in the last 6 months. It takes 5 minutes and must be done at least 48 hours before your colour appointment.", keywords: ["patch", "test", "allergy", "colour", "color"] },
    { question: "How much is a cut?", answer: "Prices are listed in our services. A women's cut and blow dry starts from the listed price; long or thick hair may be slightly more, which your stylist will confirm before starting.", keywords: ["price", "cost", "how much", "cut"] },
    { question: "Can I bring my child?", answer: "Children are welcome for their own appointments. For safety we ask that young children are not left unattended in the salon.", keywords: ["child", "kids", "children"] },
    { question: "What is your cancellation policy?", answer: "Please give us at least 24 hours' notice to cancel or move an appointment. Late cancellations may incur a fee for colour services.", keywords: ["cancel", "cancellation", "policy", "late", "fee"] },
    { question: "Do you sell gift vouchers?", answer: "Yes, gift vouchers are available at reception for any amount.", keywords: ["gift", "voucher", "card"] },
  ],
  toneGuidance: "Upbeat, friendly and personal. Use the client's name. Light emoji is fine if the client uses them first.",
  complianceRules: [
    "Only quote prices that appear in the services list and say final prices may vary with hair length or condition.",
    "Do not promise a specific result from colour or treatments; the stylist assesses hair at the appointment.",
    "Do not book a colour service for a new client without mentioning the patch test requirement.",
  ],
  emergencyMessage: "If you are having a reaction such as swelling or difficulty breathing after a treatment, please seek urgent medical help now. I have alerted the salon team.",
  escalationTriggers: [
    { pattern: "allergic reaction|(scalp|face|skin|lips?|eyes?) (is|are) (swelling|swollen|burning|blistering)|swelling (on|of|in) my (scalp|face|lips?|eyes?)|can'?t breathe|difficulty breathing|(burn(ed|t|ing)|blister(ed|ing)) my (scalp|skin|face)|chemical burn", reason: "Possible reaction to a treatment", urgency: "high", emergency: true },
    { pattern: "make a complaint|\\bcomplaint\\b|ruined my (hair|colou?r|cut)|(want|demand|need|like) (a |my )?refund|(awful|terrible|horrible|worst) (job|cut|colou?r|haircut|service|experience)", reason: "Unhappy client", urgency: "high" },
    { pattern: "bridal|\\bbride\\b|my wedding|wedding (hair|makeup|party|day|morning)", reason: "Bridal booking needs a consultation with the salon", urgency: "normal" },
  ],
  reminderTemplates: baseTemplates({
    appointment: "appointment",
    business: "salon",
    rebookLine: "it's been about six weeks since your last visit. Ready for a refresh?",
  }),
  followUp: { rebookAfterDays: 42, noShowFollowUpMinutes: 45 },
  sampleCustomerMessages: ["Can I book a cut and blow dry for Saturday?", "I need to move my appointment", "How much is balayage?"],
};
