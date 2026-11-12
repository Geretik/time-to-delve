import type { Metadata } from "next";
import { Cinzel, Fira_Sans } from "next/font/google";
import "./globals.css";
import "@/components/card/card.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
});

const fira = Fira_Sans({
  variable: "--font-fira",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Time to Delve", template: "%s · Time to Delve" },
  description: "Taktická desková hra Time to Delve a týmový generátor jejích karet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" className={`${cinzel.variable} ${fira.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
