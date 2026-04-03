import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Meta-Agent",
  description: "Autonomous SEO metadata management for Headless CMS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
