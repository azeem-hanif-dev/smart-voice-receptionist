import { redirect } from "next/navigation";
import { landingPath } from "@/lib/api";
import { getMeServer } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const me = await getMeServer();
  if (!me) redirect("/login");
  redirect(landingPath(me.orgs));
}
