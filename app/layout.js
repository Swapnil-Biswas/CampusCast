import { Bricolage_Grotesque, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import "./sections.css";

// Expressive, tightly-set display face for the big headlines.
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "CampusCast: one feed, filtered for you",
  description:
    "CampusCast is a smart campus announcement platform. Filter by department, year, club and urgency, and find hackathon teams, notes, mentors and more.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
