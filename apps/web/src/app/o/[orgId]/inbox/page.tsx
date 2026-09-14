import { Suspense } from "react";
import { InboxView } from "@/components/inbox/inbox-view";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export default async function InboxPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-[calc(100dvh-5.5rem)] w-full rounded-2xl" />}>
      <InboxView orgId={orgId} />
    </Suspense>
  );
}
