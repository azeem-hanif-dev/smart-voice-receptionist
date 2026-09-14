import type { Vertical } from "@ar/shared";
import type { VerticalPack } from "./types.js";
import { dentalPack } from "./dental.js";
import { clinicPack } from "./clinic.js";
import { salonPack } from "./salon.js";
import { physioPack } from "./physio.js";
import { vetPack } from "./vet.js";
import { chiroPack } from "./chiro.js";
import { nailSpaPack } from "./nailspa.js";

export * from "./types.js";
export { dentalPack, clinicPack, salonPack, physioPack, vetPack, chiroPack, nailSpaPack };

/** Registry. Adding a vertical = add a pack file and one line here. */
export const VERTICAL_PACKS: Record<Vertical, VerticalPack> = {
  DENTAL: dentalPack,
  CLINIC: clinicPack,
  SALON: salonPack,
  PHYSIO: physioPack,
  VET: vetPack,
  CHIRO: chiroPack,
  NAILSPA: nailSpaPack,
};

export function getVerticalPack(vertical: Vertical): VerticalPack {
  const pack = VERTICAL_PACKS[vertical];
  if (!pack) throw new Error(`Unknown vertical: ${vertical}`);
  return pack;
}

export function listVerticalPacks(): VerticalPack[] {
  return Object.values(VERTICAL_PACKS);
}
