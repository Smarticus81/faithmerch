import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faith Apparel — Desk",
  description: "AI design to fulfillment, production ready.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
