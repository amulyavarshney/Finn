import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { OfflineBanner } from "@/components/shell/offline-banner";
import { TabBar } from "@/components/shell/tab-bar";
import { AuroraField } from "@/components/glass/glass";
import { ThemeProvider, themeBootstrapScript } from "@/components/glass/theme-provider";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FINN — what changed, and why you should care",
  description:
    "A mobile-first investment agent that triages NSE corporate filings by materiality and researches any ticker from primary sources only.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "FINN" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Required for env(safe-area-inset-*) to report real values on notched phones.
  viewportFit: "cover",
  themeColor: "#f7f8fb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <ThemeProvider>
          <AuroraField />
          <OfflineBanner />
          {/* Capped at phone width so a reviewer on a laptop still sees the
              product as designed rather than a stretched desktop layout. */}
          <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
            <main className="flex-1 pb-28">{children}</main>
            <TabBar />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
