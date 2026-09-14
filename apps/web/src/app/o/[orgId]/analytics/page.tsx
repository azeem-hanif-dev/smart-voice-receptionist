"use client";

import { useParams } from "next/navigation";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export default function AnalyticsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params?.orgId;
  if (!orgId) return null;
  return <AnalyticsDashboard orgId={orgId} />;
}
