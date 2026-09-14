"use client";

import * as React from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Member, MemberInput, Org, Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { EmptyState, IconButton, RowActions, SettingsCard } from "./ui";

export function TeamTab({ org }: { org: Org }) {
  const { toast } = useToast();
  const [members, setMembers] = React.useState<Member[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<Role>("STAFF");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setMembers(await api.get<Member[]>(`/orgs/${org.id}/members`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setMembers([]);
    }
  }, [org.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!name.trim() || !email.trim() || password.length < 8) {
      toast({ title: "Check the details", description: "Name, email and a password of at least 8 characters.", variant: "destructive" });
      return;
    }
    const body: MemberInput = { name: name.trim(), email: email.trim(), password, role };
    setSaving(true);
    try {
      await api.post<Member>(`/orgs/${org.id}/members`, body);
      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("STAFF");
      await load();
    } catch (err) {
      toast({ title: "Could not add the member", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`Remove ${member.name} from ${org.name}?`)) return;
    try {
      await api.del(`/orgs/${org.id}/members/${member.userId}`);
      await load();
    } catch (err) {
      toast({ title: "Could not remove the member", description: errorMessage(err), variant: "destructive" });
    }
  }

  return (
    <SettingsCard
      title="Team"
      description="People who can read the inbox and manage this business."
      aside={
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Add member
        </Button>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {members === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members listed"
          description="Invite the people who answer customers so they can pick up handoffs."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add member
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-24">Role</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId} className="group">
                  <TableCell className="font-semibold">{member.name}</TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={member.role === "OWNER" ? "brand" : "muted"}>{member.role.toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconButton label="Remove" destructive onClick={() => void remove(member)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a team member</DialogTitle>
              <DialogDescription>
                If the email is new an account is created with the password you set here.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="member-name">Name</Label>
                <Input id="member-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-password">Password</Label>
                <Input
                  id="member-password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-role">Role</Label>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger id="member-role" className="h-10 rounded-lg bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNER">Owner</SelectItem>
                    <SelectItem value="STAFF">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="border-t border-border/70 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void add()} disabled={saving}>
                {saving ? "Adding..." : "Add member"}
              </Button>
            </DialogFooter>
          </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
