import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getMeServer } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const me = await getMeServer();
  if (!me) redirect("/login");

  const org = me.orgs.find((candidate) => candidate.id === orgId);
  if (!org) {
    redirect(me.orgs.length > 0 ? `/o/${me.orgs[0].id}/inbox` : "/onboarding");
  }

  return (
    <AppShell me={me} org={org}>
      {children}
    </AppShell>
  );
}
