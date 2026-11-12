import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Data Cleaner — Clean messy CSV, Excel and JSON in your browser",
  description:
    "Drop a CSV, TSV, Excel or JSON file (or paste raw text) and get standardised column names, parsed dates, replaced placeholders, removed duplicates and a full cleaning report.",
  keywords: [
    "data cleaning",
    "CSV cleaner",
    "Excel cleaner",
    "pandas",
    "data wrangling",
    "ETL",
    "data preparation",
  ],
  authors: [{ name: "Niwamanya Douglas" }],
  openGraph: {
    title: "Data Cleaner",
    description: "Clean messy spreadsheets in seconds. Drop, paste, clean.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Data Cleaner",
    description: "Clean messy spreadsheets in seconds. Drop, paste, clean.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}