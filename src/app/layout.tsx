import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EchoSphere — Incident Commander",
  description: "Voice-native AI Incident Commander",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
