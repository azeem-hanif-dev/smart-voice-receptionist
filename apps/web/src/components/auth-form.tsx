"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck2, LoaderCircle, MessageCircle, ShieldCheck, Zap } from "lucide-react";
import { ApiError, auth, landingPath } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const POINTS = [
  { icon: MessageCircle, title: "Answers WhatsApp 24/7", body: "Questions, qualification and bookings handled while you work." },
  { icon: CalendarCheck2, title: "Books straight into your calendar", body: "Real availability, reminders, rescheduling and no double bookings." },
  { icon: ShieldCheck, title: "Hands off when it should", body: "Emergencies and complaints go to a person; staff take over in one click." },
];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = isRegister ? await auth.register({ email, password, name }) : await auth.login({ email, password });
      router.replace(landingPath(result.orgs ?? []));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.issues.length ? err.issues.map((issue) => issue.message).join(", ") : err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="brand-surface relative hidden flex-col justify-between p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-glow">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">AI Receptionist</span>
        </div>
        <div className="max-w-md">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100">
            <Zap className="h-3.5 w-3.5" /> Live in under five minutes
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight xl:text-[44px]">
            Never lose another appointment because nobody answered WhatsApp.
          </h1>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-emerald-200">
                  <p.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{p.title}</p>
                  <p className="text-sm text-slate-300">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-400">Dental · Clinic · Salon · Physiotherapy · Veterinary · Chiropractic</p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center bg-background p-6 sm:p-10">
        <form onSubmit={onSubmit} className="w-full max-w-sm animate-fade-in-up">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="font-bold tracking-tight">AI Receptionist</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{isRegister ? "Create your account" : "Welcome back"}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isRegister ? "Set up your AI receptionist in a few minutes." : "Sign in to your dashboard."}
          </p>

          <div className="mt-8 space-y-5">
            {isRegister ? (
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 8 : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {isRegister ? <p className="text-xs text-muted-foreground">At least 8 characters.</p> : null}
            </div>
            {error ? <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {isRegister ? "Create account" : "Sign in"}
            </Button>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link href="/register" className="font-semibold text-primary underline-offset-4 hover:underline">
                  Create an account
                </Link>
              </>
            )}
          </p>
          {!isRegister ? (
            <p className="mt-8 rounded-xl border border-border/70 bg-card p-3 text-xs text-muted-foreground shadow-card">
              Demo logins: <span className="font-medium text-foreground">owner@dental.demo</span>, owner@salon.demo, owner@vet.demo… password{" "}
              <span className="font-medium text-foreground">demo1234</span>
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
