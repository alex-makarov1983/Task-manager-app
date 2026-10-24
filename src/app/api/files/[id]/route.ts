import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { getViewer } from "@/lib/auth";

export async function GET(_: Request, ctx: RouteContext<"/api/files/[id]">) {
  const viewer = await getViewer();
  if (!viewer) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.workspaceId, viewer.workspaceId)));
  if (!file) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
