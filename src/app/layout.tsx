import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Party Parcel",
  description:
    "Build a cozy pixel-art birthday room, pack a gift box, and share it with your friends.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- root layout, so this is global by design; the literal font-family name is also reused inside Canvas/PixiJS text, which next/font's renamed families would break */}
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap"
          rel="stylesheet"
        />
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className="h-full min-h-full flex flex-col bg-[#0d0d1f] antialiased">
        {children}
      </body>
    </html>
  );
}
