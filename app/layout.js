import { Fraunces, Schibsted_Grotesk, Caveat } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-display",
  display: "swap",
});

const body = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// handwriting used on the sticky notes
const hand = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-hand",
  display: "swap",
});

export const metadata = {
  title: "CampusCast: one feed, filtered for you",
  description:
    "CampusCast is a smart campus announcement platform. Filter by department, year, club and urgency, and find hackathon teams, notes, mentors and more.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
