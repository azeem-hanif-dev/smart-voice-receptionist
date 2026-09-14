"use client";

import * as React from "react";
import { PhoneForwarded, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { EscalationContact, Org } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { EmptyState, IconButton, SaveFooter, SettingsCard, useSavedFlag } from "./ui";

const NOTIFY_VIA: EscalationContact["notifyVia"][] = ["dashboard", "whatsapp", "email"];

export function EscalationTab({ org, onSaved }: { org: Org; onSaved: (org: Org) => void }) {
  const { toast } = useToast();
  const [contacts, setContacts] = React.useState<EscalationContact[]>(org.escalationContacts ?? []);
  const [saving, setSaving] = React.useState(false);
  const [saved, markSaved] = useSavedFlag();

  function update(index: number, patch: Partial<EscalationContact>) {
    setContacts((current) => current.map((contact, i) => (i === index ? { ...contact, ...patch } : contact)));
  }

  async function save() {
    const cleaned = contacts
      .filter((contact) => contact.name.trim())
      .map((contact) => ({
        name: contact.name.trim(),
        phone: contact.phone?.trim() || undefined,
        email: contact.email?.trim() || undefined,
        notifyVia: contact.notifyVia,
      }));
    setSaving(true);
    try {
      const updated = await api.patch<Org>(`/orgs/${org.id}`, { escalationContacts: cleaned });
      onSaved(updated);
      setContacts(updated.escalationContacts ?? cleaned);
      markSaved();
      toast({ title: "Escalation contacts saved", variant: "success" });
    } catch (err) {
      toast({ title: "Could not save", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const addContact = () =>
    setContacts((current) => [...current, { name: "", phone: "", email: "", notifyVia: "dashboard" }]);

  return (
    <SettingsCard
      title="Escalation"
      description="Who to tell when the assistant hands a conversation to a human."
      aside={
        <Button variant="outline" size="sm" onClick={addContact}>
          <Plus className="h-4 w-4" />
          Add contact
        </Button>
      }
      footer={<SaveFooter saving={saving} saved={saved} onSave={() => void save()} />}
    >
      {contacts.length === 0 ? (
        <EmptyState
          icon={PhoneForwarded}
          title="No escalation contacts"
          description="Handoffs will only show in the inbox until someone is listed here."
          action={
            <Button onClick={addContact}>
              <Plus className="h-4 w-4" />
              Add contact
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {contacts.map((contact, index) => (
            <li key={index} className="rounded-xl border border-border/70 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor={`escalation-name-${index}`}>Name</Label>
                  <Input
                    id={`escalation-name-${index}`}
                    value={contact.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`escalation-phone-${index}`}>Phone</Label>
                  <Input
                    id={`escalation-phone-${index}`}
                    value={contact.phone ?? ""}
                    onChange={(event) => update(index, { phone: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`escalation-email-${index}`}>Email</Label>
                  <Input
                    id={`escalation-email-${index}`}
                    type="email"
                    value={contact.email ?? ""}
                    onChange={(event) => update(index, { email: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`escalation-notify-${index}`}>Notify via</Label>
                  <div className="flex gap-1">
                    <Select
                      value={contact.notifyVia}
                      onValueChange={(value) =>
                        update(index, { notifyVia: value as EscalationContact["notifyVia"] })
                      }
                    >
                      <SelectTrigger id={`escalation-notify-${index}`} className="h-10 rounded-lg bg-card capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOTIFY_VIA.map((value) => (
                          <SelectItem key={value} value={value} className="capitalize">
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <IconButton
                      label="Remove"
                      destructive
                      onClick={() => setContacts((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
