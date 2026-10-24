"use client";

import { useState, useTransition } from "react";
import { updateSettings } from "@/app/actions/structure";
import { getDict, type Locale } from "@/lib/i18n";

export function SettingsForm({ locale, name, timezone }: { locale: Locale; name: string; timezone: string }) {
  const t = getDict(locale);
  const [values, setValues] = useState({ name, locale, timezone });
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const zones = Intl.supportedValuesOf("timeZone");

  return (
    <form
      className="max-w-sm space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await updateSettings(values);
          setSaved(true);
        });
      }}
    >
      <label className="block">
        <span className="label">{t.name}</span>
        <input className="input" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">{t.language}</span>
        <select className="input" value={values.locale} onChange={(e) => setValues({ ...values, locale: e.target.value as Locale })}>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="block">
        <span className="label">{t.timezone}</span>
        <select className="input" value={values.timezone} onChange={(e) => setValues({ ...values, timezone: e.target.value })}>
          {(zones.includes(values.timezone) ? zones : [values.timezone, ...zones]).map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{t.save}</button>
        {saved && !pending && <span className="text-sm text-muted">{t.saved}</span>}
      </div>
    </form>
  );
}
