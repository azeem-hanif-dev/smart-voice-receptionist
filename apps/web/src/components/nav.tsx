import { BarChart3, CalendarDays, Inbox, MessageSquare, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function navItems(orgId: string): NavItem[] {
  return [
    { href: `/o/${orgId}/inbox`, label: "Inbox", icon: Inbox },
    { href: `/o/${orgId}/calendar`, label: "Calendar", icon: CalendarDays },
    { href: `/o/${orgId}/contacts`, label: "Contacts", icon: Users },
    { href: `/o/${orgId}/analytics`, label: "Analytics", icon: BarChart3 },
    { href: `/o/${orgId}/demo`, label: "Demo chat", icon: MessageSquare },
    { href: `/o/${orgId}/settings`, label: "Settings", icon: Settings },
  ];
}

const VERTICAL_LABELS: Record<string, string> = {
  DENTAL: "Dental",
  CLINIC: "Clinic",
  SALON: "Salon",
  PHYSIO: "Physio",
  VET: "Vet",
  CHIRO: "Chiro",
  NAILSPA: "Nail spa",
};

export function verticalLabel(vertical: string): string {
  return VERTICAL_LABELS[vertical] ?? vertical;
}
