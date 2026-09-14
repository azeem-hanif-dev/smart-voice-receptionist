import { DemoView } from "@/components/demo/demo-view";

export const dynamic = "force-dynamic";

export default async function DemoPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <DemoView orgId={orgId} />;
}
