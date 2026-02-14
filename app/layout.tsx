import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elastic Papers",
  description: "arXiv research assistant with semantic search",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
