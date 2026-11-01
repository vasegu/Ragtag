import type { Metadata } from "next";
import { Geist_Mono, Open_Sans } from "next/font/google";
import "./globals.css";

// Open Sans is Hackney's own web font; Geist Mono for small labels.
const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "One Hackney",
  description: "One front door for Hackney residents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Live voice connects to OpenAI over WebRTC; warm the connection early. */}
        <link rel="preconnect" href="https://api.openai.com" crossOrigin="anonymous" />
      </head>
      <body className={`${openSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
