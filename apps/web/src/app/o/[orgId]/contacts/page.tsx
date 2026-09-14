"use client";

import { useParams } from "next/navigation";
import { ContactsTable } from "@/components/contacts/contacts-table";

export default function ContactsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params?.orgId;
  if (!orgId) return null;
  return <ContactsTable orgId={orgId} />;
}
