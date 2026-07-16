import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { DemoNoticeModal } from "@/components/DemoNoticeModal";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Dispatch Exception CoPilot",
  description:
    "Turn chaotic courier exception updates into strict, audited business operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${body.variable} ${display.variable} font-body antialiased`}>
        <TooltipProvider delayDuration={180}>{children}</TooltipProvider>
        <DemoNoticeModal />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
