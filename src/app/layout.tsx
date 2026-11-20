import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Doto, Martian_Mono, Mona_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-mona",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-martian",
  display: "swap",
});

const dots = Doto({
  subsets: ["latin"],
  axes: ["ROND"],
  variable: "--font-doto",
  display: "swap",
});

const title = "Beyond the Algorithm";
const description =
  "Nine short games that show what AI can work out about you. Made by IISJ Computer Science students for EDEX 2026.";

/** Absolute base for OG image URLs: explicit env, then the Vercel production domain, then localhost. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: `%s · ${title}` },
  description,
  applicationName: title,
  openGraph: { title, description, type: "website", siteName: title },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  themeColor: "#0e1015",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${dots.variable}`}>
      <body>
        <Providers>{children}</Providers>
        {/* Vercel Web Analytics: page views and visitors, alongside our own game sessions in Firestore. */}
        <Analytics />
      </body>
    </html>
  );
}
