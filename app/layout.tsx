import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Pomoflow — Focus, set to music";
const description = "A flexible Pomodoro timer with a built-in Spotify player for focused work on any device.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host") || "pomoflow.vercel.app";
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? host : "pomoflow.vercel.app";
  const protocol = safeHost.startsWith("localhost") || safeHost.startsWith("127.0.0.1") ? "http" : "https";

  return {
    metadataBase: new URL(`${protocol}://${safeHost}`),
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Pomoflow focus timer at 25 minutes" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
