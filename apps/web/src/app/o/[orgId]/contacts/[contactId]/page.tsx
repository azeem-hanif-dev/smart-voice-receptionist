"use client";

import { useParams } from "next/navigation";
import { ContactDetail } from "@/components/contacts/contact-detail";

export default function ContactDetailPage() {
  const params = useParams<{ orgId: string; contactId: string }>();
  const orgId = params?.orgId;
  const contactId = params?.contactId;
  if (!orgId || !contactId) return null;
  return <ContactDetail orgId={orgId} contactId={contactId} />;
}
