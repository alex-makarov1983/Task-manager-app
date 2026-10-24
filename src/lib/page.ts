import "server-only";
import { requireViewer } from "./auth";
import { todayIn } from "./dates";
import { getDict } from "./i18n";

/** What every signed-in page needs: the viewer, their dictionary and "today" in their time zone. */
export async function pageContext() {
  const viewer = await requireViewer();
  return { viewer, locale: viewer.locale, t: getDict(viewer.locale), today: todayIn(viewer.timezone) };
}
