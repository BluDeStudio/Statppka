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

  authors: [
    {
      name: "MyTeamHub",
    },
  ],

  creator: "MyTeamHub",
  publisher: "MyTeamHub",

  icons: {
    icon: [
      {
        url: "/icon.png?v=2",
        type: "image/png",
      },
    ],
    shortcut: "/icon.png?v=2",
    apple: [
      {
        url: "/icon.png?v=2",
        type: "image/png",
      },
    ],
  },

  openGraph: {
    type: "website",
    locale: "cs_CZ",

    url: "https://myteamhub.cz",

    siteName: "MyTeamHub",

    title: "MyTeamHub",

    description:
      "Zápasy, tréninky, docházka, ankety, statistiky a správa týmu na jednom místě.",

    images: [
      {
        url: "https://myteamhub.cz/logo.png?v=2",
        width: 1536,
        height: 1024,
        alt: "MyTeamHub",
        type: "image/png",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",

    title: "MyTeamHub",

    description:
      "Zápasy, tréninky, docházka, ankety, statistiky a správa týmu na jednom místě.",

    images: ["https://myteamhub.cz/logo.png?v=2"],
  },

  robots: {
    index: true,
    follow: true,
  },

  alternates: {
    canonical: "https://myteamhub.cz",
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