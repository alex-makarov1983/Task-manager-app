export type NoteBlock =
  | { id: string; type: "text" | "h1" | "h2" | "quote"; text: string }
  | { id: string; type: "bullet" | "numbered"; text: string }
  | { id: string; type: "todo"; text: string; checked: boolean; taskId?: string }
  | { id: string; type: "divider" }
  | { id: string; type: "image"; fileId: string; caption: string };

export type BlockType = NoteBlock["type"];

export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function blockText(b: NoteBlock): string {
  if (b.type === "divider") return "";
  if (b.type === "image") return b.caption;
  return b.text;
}

export function notePlainText(title: string, blocks: NoteBlock[]): string {
  return [title, ...blocks.map(blockText)].filter(Boolean).join("\n");
}
