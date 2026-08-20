"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Seed-account cheat sheet for local development only.
 *
 * `process.env.NODE_ENV` is inlined by the bundler at build time, so in a production build this
 * whole block is statically false and the account list is dropped from the client bundle entirely
 * — the emails and the shared seed password never reach a real deployment's login page, which is
 * both the first screen a customer sees and, in any environment where prisma/seed.ts was ever run,
 * a live credential list.
 */
const SHOW_DEMO_ACCOUNTS = process.env.NODE_ENV !== "production";

const DEMO_ACCOUNTS = [
  { label: "مدير المنصة", email: "admin@platform.dev" },
  { label: "مدير شركة (مؤسسة النور)", email: "owner@alnoor.example" },
  { label: "موظف فرع (مؤسسة النور)", email: "branch@alnoor.example" },
  { label: "سائق (مؤسسة النور)", email: "driver@alnoor.example" },
];

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <div className="w-full max-w-sm space-y-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">البريد الإلكتروني</Label>
          <Input id="email" name="email" type="email" placeholder="name@company.com" required dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">كلمة المرور</Label>
          <Input id="password" name="password" type="password" placeholder="••••••••" required dir="ltr" />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "جارٍ الدخول..." : "تسجيل الدخول"}
        </Button>
      </form>

      {SHOW_DEMO_ACCOUNTS && (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">حسابات تجريبية (كلمة المرور للجميع: Passw0rd!)</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-2">
                <span>{a.label}</span>
                <span className="text-foreground/80" dir="ltr">{a.email}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
