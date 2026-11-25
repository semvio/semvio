import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Motion } from "@/components/site/Motion";
import { MOTION_BOOT } from "@/lib/motionBoot";
import { WalletModalProvider } from "@/components/wallet/WalletButton";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { BRAND } from "@/config/brand";
import { HOME_DESCRIPTION, HOME_TITLE, siteLd } from "@/lib/seo";

// Self-hosted, SIL Open Font License (src/fonts/OFL-*.txt).
const geist = localFont({ src: [{ path: "../fonts/geist-variable.woff2", weight: "100 900", style: "normal" }], variable: "--font-geist", display: "swap" });
const geistMono = localFont({ src: [{ path: "../fonts/geist-mono-variable.woff2", weight: "100 900", style: "normal" }], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: HOME_TITLE, template: `%s | ${BRAND.name}` },
  description: HOME_DESCRIPTION,
  applicationName: BRAND.name,
};

export const viewport: Viewport = { themeColor: "#080a09", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Motion gate before first paint (only without reduced motion); see components/site/Motion.tsx */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      </head>
      <body>
        <a className="bl-skip" href="#main">
          Skip to content
        </a>
        <JsonLd data={siteLd} />
        <WalletProvider>
          <WalletModalProvider>
            <SiteHeader />
            <main id="main">{children}</main>
            <SiteFooter />
            <Motion />
          </WalletModalProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
