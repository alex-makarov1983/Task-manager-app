import type { Metadata, Viewport } from "next";
import { getViewer } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focus",
  description: "Tasks, notes and vault in one place",
  appleWebApp: { capable: true, title: "Focus", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  return (
    <html lang={viewer?.locale ?? "ru"} className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
