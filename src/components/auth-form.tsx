"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signIn, signUp } from "@/app/actions/auth";
import { getDict, type Locale } from "@/lib/i18n";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [locale, setLocale] = useState<Locale>("ru");
  const [timezone, setTimezone] = useState("UTC");
  useEffect(() => {
    // Detected on the client only; the server render keeps Russian/UTC defaults.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(navigator.language.startsWith("ru") ? "ru" : "en");
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  const t = getDict(locale);
  const [state, action, pending] = useActionState(mode === "login" ? signIn : signUp, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">{t.appName}</h1>
      <p className="mb-6 text-sm text-muted">{mode === "login" ? t.login : t.signup}</p>
      <form action={action} className="space-y-3">
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">{t.name}</label>
            <input id="name" name="name" required className="input" autoComplete="name" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">{t.email}</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            {t.password}
            {mode === "signup" && <span className="font-normal"> · {t.passwordHint}</span>}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            className="input"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
        <input type="hidden" name="timezone" value={timezone} />
        <input type="hidden" name="locale" value={locale} />
        {state?.error && <p className="text-sm text-danger">{t.errors[state.error] ?? state.error}</p>}
        <button className="btn-primary w-full justify-center" disabled={pending}>
          {mode === "login" ? t.login : t.signup}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        {mode === "login" ? t.noAccount : t.haveAccount}{" "}
        <Link className="text-accent" href={mode === "login" ? "/signup" : "/login"}>
          {mode === "login" ? t.signup : t.login}
        </Link>
      </p>
    </main>
  );
}
