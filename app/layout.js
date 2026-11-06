import { Archivo_Black, Schibsted_Grotesk, DM_Mono } from "next/font/google";
import "./globals.css";

// Heavy display face: clean contours, so hollow (outlined) text renders crisply.
const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const body = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// small labels, tags and numbers
const mono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

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
