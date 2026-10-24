import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
import { getViewer } from "@/lib/auth";

const MAX_BYTES = 10 * 1024 * 1024;
// No SVG: it can carry script and is served from our own origin.
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"]);

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "images only" }, { status: 415 });

  const [row] = await db
    .insert(files)
    .values({
      workspaceId: viewer.workspaceId,
      name: file.name,
      mime: file.type,
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
    })
    .returning({ id: files.id });
  return NextResponse.json({ id: row.id });
}
