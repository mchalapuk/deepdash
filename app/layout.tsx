import type { Metadata } from "next";
import localFont from "next/font/local";
import { ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import { getLayoutCsp } from "@/lib/csp";
import { AppProviders } from "./_components/AppProviders";
import "./globals.css";

const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-sans",
  display: "swap",
});

const isDev = process.env.NODE_ENV === "development";

export const metadata: Metadata = {
  title: "Work Tools",
  description: "Local-only productivity dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {isDev ? (
          <meta httpEquiv="Content-Security-Policy" content={getLayoutCsp()} />
        ) : null}
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
