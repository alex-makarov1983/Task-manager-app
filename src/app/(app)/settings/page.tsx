import { PageTitle } from "@/components/section";
import { SettingsForm } from "@/components/settings-form";
import { pageContext } from "@/lib/page";

export default async function SettingsPage() {
  const { viewer, locale, t } = await pageContext();
  return (
    <>
      <PageTitle sub={viewer.email}>{t.settings}</PageTitle>
      <SettingsForm locale={locale} name={viewer.name} timezone={viewer.timezone} />
    </>
  );
}
