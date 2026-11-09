export const marqueeWords = [
  "Hackathons", "Department notices", "Examinations", "Workshops", "Cultural events",
  "Connect", "Notes & papers", "CampusXchange", "Free mentorship",
];

export const chaos = [
  { k: "WhatsApp groups", d: "Dozens of class, club and batch groups. The one real notice drowns in chat." },
  { k: "Notice boards", d: "Seen only if you happen to walk past. Easy to miss, impossible to search." },
  { k: "Institutional email", d: "Official, rarely opened, and no sign of what is actually urgent." },
  { k: "Word of mouth", d: "Slow, lossy, and different for every student you ask." },
];

export const flow = [
  { n: "01", t: "Publish once", d: "Faculty and club leads write one announcement. Pick the audience: department, year, club, or everyone." },
  { n: "02", t: "We rank and target", d: "Every post carries an urgency level from Now to FYI, so the engine knows who to reach and how loudly." },
  { n: "03", t: "Students just see theirs", d: "A personal feed plus push alerts. First-years never see final-year placement drives." },
];

export const depts = ["CSE", "ECE", "ME"];
export const years = [1, 2, 3, 4];
export const clubs = ["Coding Club", "Dance Club", "Robotics Club", "Music Club"];

// depts / years: null means "everyone"
export const notices = [
  { id: 1, t: "DBMS internal rescheduled to Tue, 10:00 AM", cat: "Examinations", u: 0, depts: ["CSE"], years: [2], club: null, ago: "2 min ago" },
  { id: 2, t: "Smart India Hackathon registration closes tonight", cat: "Hackathon", u: 1, depts: null, years: null, club: "Coding Club", ago: "1 h ago" },
  { id: 3, t: "Intro to Docker workshop: 40 seats left", cat: "Workshops", u: 2, depts: ["CSE", "ECE"], years: [2, 3], club: null, ago: "3 h ago" },
  { id: 4, t: "ECE semester 5 hall tickets are out", cat: "Examinations", u: 1, depts: ["ECE"], years: [3], club: null, ago: "4 h ago" },
  { id: 5, t: "Annual Fest: dance crew auditions this Friday", cat: "Cultural", u: 2, depts: null, years: null, club: "Dance Club", ago: "5 h ago" },
  { id: 6, t: "Robotics Club recruitment: first-years welcome", cat: "Cultural", u: 3, depts: null, years: [1], club: "Robotics Club", ago: "Yesterday" },
  { id: 7, t: "Mechanical workshop closed for maintenance today", cat: "Department", u: 0, depts: ["ME"], years: null, club: null, ago: "Yesterday" },
  { id: 8, t: "Resume clinic for placement-year students", cat: "Department", u: 2, depts: null, years: [4], club: null, ago: "Yesterday" },
  { id: 9, t: "Music night poster: Friday, 6 PM", cat: "Cultural", u: 3, depts: null, years: null, club: "Music Club", ago: "2 days ago" },
  { id: 10, t: "ME semester 3 fee deadline extended to the 20th", cat: "Department", u: 1, depts: ["ME"], years: [2], club: null, ago: "2 days ago" },
];

export const URGENCY_LABELS = ["Now", "Today", "Soon", "FYI"];

export const urgency = [
  { p: "Now", name: "Critical", ex: "Exam rescheduled, campus closure", how: "Instant push, pinned to the top, repeats until you acknowledge it.", w: 100, c: "var(--p0)" },
  { p: "Today", name: "High", ex: "Registration closes today, fee deadline", how: "Instant push with a highlighted card in your feed.", w: 74, c: "var(--p1)" },
  { p: "Soon", name: "Normal", ex: "Workshop opened, department circular", how: "Lands in your feed and the daily digest.", w: 46, c: "var(--p2)" },
  { p: "FYI", name: "Low", ex: "Club poster, general information", how: "Feed only, plus the weekly digest.", w: 22, c: "var(--p3)" },
];

export const features = [
  { n: "01", g: "Events", t: "Hackathon", h: "Every hackathon, in one place", b: ["Filter by theme, mode and deadline", "Countdown and one-tap reminder", "Jump straight to Connect for teammates"], icon: "Code2" },
  { n: "02", g: "Official", t: "Department Notifications", h: "Circulars for your dept, year and section", b: ["PDF circulars open in-app", "Admins see read receipts", "Scheduled posts with auto-expiry"], icon: "Building2" },
  { n: "03", g: "Official", t: "Examinations", h: "Exam changes never go unnoticed", b: ["Personal exam calendar with countdown", "Any change is auto-marked Now", "Timetables and results archive"], icon: "FileText" },
  { n: "04", g: "Official", t: "Workshops", h: "Register, remember, show up", b: ["Seat cap with waitlist", "Reminders at 24 h and 1 h", "Attendee CSV for organisers"], icon: "Presentation" },
  { n: "05", g: "Events", t: "Cultural Events", h: "Fests, auditions and club nights", b: ["Follow the clubs you love", "Posters and photo galleries", "Mark Interested or Going"], icon: "Drama" },
  { n: "06", g: "Community", t: "Connect", h: "Find the teammate who completes your team", b: ["Skills-based profiles and requests", "Contact shared only after both accept", "Report and block on every profile"], icon: "Users" },
  { n: "07", g: "Community", t: "Notes & Previous Papers", h: "Past papers, found in seconds", b: ["Search by subject, semester and year", "Moderated uploads, upvotes lift the best", "Duplicate detection built in"], icon: "BookOpen" },
  { n: "08", g: "Community", t: "CampusXchange", h: "Seniors sell. Juniors save.", b: ["List an item in under a minute", "Verified, campus-only, 30-day expiry", "Chat opens only on request"], icon: "Repeat2" },
  { n: "09", g: "Community", t: "Free Mentorship", h: "A senior who has already been there", b: ["Find mentors by domain", "Request, accept and schedule with reminders", "Feedback after every session"], icon: "HeartHandshake" },
];

export const engine = [
  { t: "Personalized feed", d: "Built from your department, year and followed clubs." },
  { t: "Filter and sort", d: "By department, year, club, category and urgency." },
  { t: "Urgency-driven push", d: "Loud for Now, quiet for FYI, and a Now alert is never silenced." },
  { t: "Admin composer", d: "Audience picker, urgency, schedule and expiry in one form." },
  { t: "Reach analytics", d: "Read receipts show who has actually seen it." },
  { t: "Reminders and digests", d: "Bookmarks, add-to-calendar, daily and weekly digest." },
];


export const trust = ["College-email verification", "Report buttons everywhere", "Moderation queue", "Rate limits against spam", "Only admins mark Now and Today", "Delete your data any time"];


