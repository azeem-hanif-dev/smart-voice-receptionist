"use client";

import { useParams } from "next/navigation";
import { CalendarView } from "@/components/calendar/calendar-view";

export default function CalendarPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params?.orgId;
  if (!orgId) return null;
  return <CalendarView orgId={orgId} />;
}
