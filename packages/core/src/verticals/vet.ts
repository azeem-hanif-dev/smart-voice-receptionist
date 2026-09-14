import type { VerticalPack } from "./types.js";
import { baseTemplates } from "./shared-templates.js";

const WEEKDAYS_8_TO_6: [number, number, number][] = [1, 2, 3, 4, 5].map((d) => [d, 480, 1080]);

export const vetPack: VerticalPack = {
  id: "VET",
  displayName: "Veterinary clinic",
  tagline: "Consultations, vaccinations and surgery bookings for a vet practice.",
  vocabulary: {
    customer: "pet owner",
    customerPlural: "pet owners",
    provider: "vet",
    providerPlural: "vets",
    appointment: "appointment",
    business: "clinic",
  },
  defaultServices: [
    { name: "Consultation", durationMinutes: 20, bufferAfterMinutes: 5, priceCents: 7500, description: "General examination for one pet." },
    { name: "Vaccination", durationMinutes: 15, bufferAfterMinutes: 5, priceCents: 6000 },
    { name: "Dental clean (under anaesthetic)", durationMinutes: 90, bufferAfterMinutes: 15, priceCents: 45000, description: "Day procedure; pet must fast from midnight." },
    { name: "Desexing consultation", durationMinutes: 20, priceCents: 0, description: "Free pre-surgery consultation." },
    { name: "Nail trim", durationMinutes: 10, priceCents: 2000 },
    { name: "Puppy / kitten first visit", durationMinutes: 30, bufferAfterMinutes: 5, priceCents: 8500 },
  ],
  defaultHours: [...WEEKDAYS_8_TO_6, [6, 540, 780]],
  qualificationQuestions: [
    { id: "species", prompt: "What kind of animal is your pet?", ask: "What kind of animal the pet is (dog, cat, rabbit, bird, other).", when: "always", options: ["Dog", "Cat", "Other"] },
    { id: "petName", prompt: "What's your pet's name, and roughly how old are they?", ask: "The pet's name and approximate age.", when: "always" },
    { id: "returning", prompt: "Has your pet been to us before?", ask: "Whether the pet has been seen at the clinic before.", when: "always", options: ["Yes", "No, first visit"] },
    { id: "reason", prompt: "What's the visit for?", ask: "The reason for the visit in one sentence, so staff can allow enough time.", when: "always" },
  ],
  faqSeeds: [
    { question: "Do you treat exotic pets?", answer: "We see dogs, cats, rabbits and guinea pigs. For birds, reptiles and other exotics we will refer you to a specialist.", keywords: ["exotic", "bird", "reptile", "snake", "rabbit", "guinea"] },
    { question: "Does my pet need to fast before surgery?", answer: "For procedures under anaesthetic, no food after midnight the night before; water is fine. The vet will confirm when you book.", keywords: ["fast", "food", "eat", "surgery", "anaesthetic", "anesthetic"] },
    { question: "Do you offer payment plans?", answer: "Yes, we offer payment plans for larger procedures through a third-party provider. Ask at reception for details.", keywords: ["payment plan", "afford", "instalments", "installments"] },
    { question: "What do I do in an emergency after hours?", answer: "After hours, please contact the 24-hour emergency animal hospital listed in the business profile. During opening hours, call us and come straight in.", keywords: ["emergency", "after hours", "urgent", "night"] },
    { question: "Is parking available?", answer: "Yes, there is parking directly outside the clinic.", keywords: ["parking", "park"] },
  ],
  toneGuidance: "Kind, calm and a little warm about the pet. Use the pet's name once you know it. Owners can be very worried; reassure without diagnosing.",
  complianceRules: [
    "Never give veterinary advice, diagnose symptoms or suggest medication or dosages, including for common products.",
    "Never promise outcomes of treatment or surgery.",
    "Only quote listed prices, and say that treatment costs depend on the vet's examination.",
    "If a pet sounds seriously unwell (collapse, difficulty breathing, poisoning, bloat, severe bleeding, unable to urinate), tell the owner to come in immediately or go to the emergency hospital, then hand off.",
  ],
  emergencyMessage: "This sounds urgent. Please bring your pet in right away during opening hours, or go to the 24-hour emergency animal hospital. I have alerted our team so they are ready.",
  escalationTriggers: [
    { pattern: "(has |just )?collapsed|(is |isn'?t |not |stopped )breathing|struggling to breathe|difficulty breathing|(ate|eaten|swallowed|got into) (some |a |the |my |a lot of |a bar of )?(chocolate|rat bait|rat poison|slug pellets|grapes|raisins|xylitol|antifreeze|ibuprofen|paracetamol|a sock|a battery)|(been|was|got) poisoned|(stomach|belly|abdomen|tummy) (is )?(swollen|bloated|hard) (and|with)|bloated and (retching|trying to vomit|restless)|(having|had|is having) (a )?seizures?( now| today| just| this morning| right now)|hit by a car|run over|can'?t (pee|urinate|wee|pass urine)|straining to (pee|urinate)|bleeding (a lot|heavily|badly|won'?t stop)|unresponsive|(is |are )?(not|un)conscious", reason: "Possible animal emergency", urgency: "high", emergency: true },
    { pattern: "euthanas|put (him|her|them|it|my \\w+) (down|to sleep)|(passed away|died|dying) (today|yesterday|this morning|last night|just now|overnight)|(is|are) dying", reason: "End-of-life conversation needs a human", urgency: "high" },
    { pattern: "make a complaint|\\bcomplaint\\b|(want|demand|need|like) (a |my )?refund", reason: "Complaint", urgency: "high" },
  ],
  reminderTemplates: baseTemplates({
    appointment: "appointment",
    business: "clinic",
    rebookLine: "it's nearly time for your pet's annual check-up and vaccinations.",
  }),
  followUp: { rebookAfterDays: 365, noShowFollowUpMinutes: 60 },
  sampleCustomerMessages: ["My dog needs his annual vaccination", "Can I bring my cat in tomorrow?", "My dog ate chocolate, what do I do?"],
};
