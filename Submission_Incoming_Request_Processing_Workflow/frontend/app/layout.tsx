import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conductor Home",
  description: "AI intake workflow operations UI for the TeleMedik POC",
  icons: {
    icon: [
      { url: "/brand/conductor-placeholder.ico", type: "image/x-icon" },
      { url: "/brand/conductor-placeholder.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/brand/conductor-placeholder.png", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
