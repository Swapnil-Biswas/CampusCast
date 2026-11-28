import { F, MISSING } from "../exams/fixtures.mjs";

export const CLUBS = [{ name: "Coding Club" }, { name: "Robotics Club" }, { name: "IEEE Student Branch" }, { name: "Cultural Committee" }];
export const NOW = new Date("2026-11-25T10:00:00+05:30");

// A clean answer for a two-day hackathon.
export const goodRaw = (over = {}, rest = {}) => ({
  documentKind: "scanned",
  hackathon: {
    name: F("BuildSprint 2026"),
    tagline: F("24 hours, one idea"),
    organizer: F("Coding Club, BMSIT&M"),
    clubName: F("Coding Club"),
    theme: F("AI for Good"),
    mode: F("offline"),
    venue: F("Seminar Hall 2, Block A, BMSIT&M"),
    mapLink: MISSING(),
    startsAt: F("2026-12-12 09:00"),
    endsAt: F("2026-12-13 09:00"),
    registrationOpensAt: F("2026-11-20 10:00"),
    registrationDeadline: F("2026-12-10 18:00"),
    teamMin: F(2),
    teamMax: F(4),
    feeAmount: F(0),
    feeNote: F("Free for all students"),
    prizePoolAmount: F(100000),
    prizePoolText: F("Prizes worth Rs. 1,00,000"),
    eligibility: F("All B.E. students"),
    tracks: F(["AI", "Web", "Open"]),
    contactName: F("Aarav"),
    contactPhone: F("+91 98450 12345"),
    contactEmail: F("codingclub@bmsit.in"),
    websiteUrl: F("www.buildsprint.example.com"),
    registrationUrl: F("https://buildsprint.example.com/register"),
    perks: F(["Certificates for all", "Internship opportunities"]),
    rules: F(["Teams of 2 to 4", "Bring your own laptop"]),
    sponsors: F(["Acme Cloud"]),
    ...over,
  },
  prizes: [
    { label: "Winner", amount: 50000, note: null, page: 1 },
    { label: "Runner-up", amount: 30000, note: null, page: 1 },
    { label: "Best design", amount: 20000, note: "Special award", page: 1 },
  ],
  schedule: [
    { date: "2026-12-12", time: "09:00", endTime: "10:00", title: "Registration and breakfast", note: null, day: "Day 1", page: 1 },
    { date: "2026-12-12", time: "10:30", endTime: null, title: "Opening ceremony", note: "Main hall", day: "Day 1", page: 1 },
    { date: null, time: "09:00", endTime: null, title: "Final presentations", note: null, day: "Day 2", page: 1 },
    { date: "2026-12-12", time: "11:00", endTime: "11:30", title: "Problem statements released", note: null, day: "Day 1", page: 1 },
  ],
  ...rest,
});
