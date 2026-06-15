import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conductor Home",
  description: "AI intake workflow operations UI for the TeleMedik POC",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
