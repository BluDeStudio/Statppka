import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://myteamhub.cz"),

  title: {
    default: "MyTeamHub",
    template: "%s | MyTeamHub",
  },

  description:
    "Zápasy, tréninky, docházka, ankety, statistiky a správa týmu na jednom místě.",

  applicationName: "MyTeamHub",

  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },

  openGraph: {
    type: "website",
    locale: "cs_CZ",
    url: "https://myteamhub.cz",
    siteName: "MyTeamHub",

    title: "MyTeamHub",

    description:
      "Zápasy, tréninky, docházka, ankety a tým na jednom místě.",

    images: [
      {
        url: "https://myteamhub.cz/logo.png",
        width: 1536,
        height: 1024,
        alt: "MyTeamHub",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",

    title: "MyTeamHub",

    description:
      "Zápasy, tréninky, docházka, ankety a tým na jednom místě.",

    images: ["https://myteamhub.cz/logo.png"],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}