// Shared by server and client code: labels, colours, formatting, navigation.

// 0 Now, 1 Today, 2 Soon, 3 FYI
export const URGENCY = [
  { id: 0, label: "Now", color: "#e8603c", text: "#ffffff", hint: "Drop everything. Instant alert, stays pinned until acknowledged." },
  { id: 1, label: "Today", color: "#f3b63f", text: "#1b1a17", hint: "Needs action today. Instant alert." },
  { id: 2, label: "Soon", color: "#8ec5d6", text: "#1b1a17", hint: "Worth planning for. Appears in the feed and the daily digest." },
  { id: 3, label: "FYI", color: "#7fb48a", text: "#1b1a17", hint: "Good to know. Feed and weekly digest only." },
];

export const CATEGORIES = {
  general: { label: "General", color: "#d9c8a8" },
  department: { label: "Department", color: "#f3b63f" },
  exam: { label: "Examinations", color: "#e8603c" },
  workshop: { label: "Workshop", color: "#7fb48a" },
  hackathon: { label: "Hackathon", color: "#8ec5d6" },
  cultural: { label: "Cultural", color: "#c58ad1" },
};

export const ROLE_LABEL = { student: "Student", admin: "Admin", super_admin: "Super-admin" };

export function timeAgo(date, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function fmtDate(date, withTime = true) {
  if (!date) return "";
  return new Date(date).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}

// "in 2 days", "in 3 h 20 min", "started 2 h ago"
export function countdown(date, now = Date.now()) {
  const ms = new Date(date).getTime() - now;
  const abs = Math.abs(ms), min = Math.round(abs / 60000);
  const text = min < 60 ? `${min} min` : min < 60 * 24 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.floor(min / 1440)} day${Math.floor(min / 1440) > 1 ? "s" : ""}`;
  return ms >= 0 ? `in ${text}` : `${text} ago`;
}

export function audienceLabel(n, clubName) {
  const parts = [];
  parts.push(n.audience_depts?.length ? n.audience_depts.map(shortBranch).join(", ") : "All departments");
  parts.push(n.audience_years?.length ? "Year " + [...n.audience_years].sort().join(", ") : "All years");
  if (clubName) parts.push(clubName);
  return parts.join(" · ");
}

export function shortBranch(b) {
  const map = {
    "Computer Science & Engineering": "CSE", "AI & Machine Learning": "AI&ML", "Civil Engineering": "Civil", "Information Science & Engineering": "ISE",
    "AI & Data Science": "AI&DS", "Computer Science & Business Systems": "CSBS", "Electronics & Communication Engineering": "ECE",
    "Electrical & Electronics Engineering": "EEE", "Electronics & Telecommunication Engineering": "ETE", "Mechanical Engineering": "Mech",
  };
  return map[b] || b;
}

// Sidebar. `admin` items only show for admins, `super` items only for super-admins.
export const NAV = [
  { group: "Overview", items: [
    { href: "/dashboard", label: "Home feed", icon: "House", exact: true },
    { href: "/dashboard/calendar", label: "Calendar", icon: "CalendarDays" },
    { href: "/dashboard/saved", label: "Saved", icon: "Bookmark" },
  ] },
  { group: "Official", items: [
    { href: "/dashboard/department", label: "Department", icon: "Building2" },
    { href: "/dashboard/exams", label: "Examinations", icon: "FileText" },
    { href: "/dashboard/workshops", label: "Workshops", icon: "Presentation" },
    { href: "/dashboard/hackathons", label: "Hackathons", icon: "Code2" },
    { href: "/dashboard/events", label: "Cultural events", icon: "Drama" },
  ] },
  { group: "Community", items: [
    { href: "/dashboard/connect", label: "Connect", icon: "Users" },
    { href: "/dashboard/notes", label: "Notes & papers", icon: "BookOpen" },
    { href: "/dashboard/xchange", label: "CampusXchange", icon: "Repeat2" },
    { href: "/dashboard/mentors", label: "Free mentorship", icon: "HeartHandshake" },
  ] },
  { group: "Admin", admin: true, items: [
    { href: "/dashboard/admin/compose", label: "Publish a notice", icon: "SquarePen", admin: true },
    { href: "/dashboard/admin/exams", label: "Exam notices", icon: "FileText", admin: true },
    { href: "/dashboard/admin/exams/approvals", label: "Exam approvals", icon: "ShieldCheck", approver: true },
    { href: "/dashboard/admin/notices", label: "Notices & reach", icon: "ChartColumn", admin: true },
    { href: "/dashboard/admin/verification", label: "ID verification", icon: "UserCheck", admin: true },
    { href: "/dashboard/admin/moderation", label: "Moderation", icon: "Flag", admin: true },
    { href: "/dashboard/admin/people", label: "People & roles", icon: "ShieldCheck", super: true },
    { href: "/dashboard/admin/clubs", label: "Clubs", icon: "Sparkles", admin: true },
    { href: "/dashboard/admin/audit", label: "Audit log", icon: "ScrollText", admin: true },
  ] },
];

export const XCHANGE_CATEGORIES = { books: "Books", electronics: "Electronics", cycles: "Cycles", hostel: "Hostel items", stationery: "Stationery", clothing: "Clothing", other: "Other" };
export const XCHANGE_CONDITIONS = { new: "New", like_new: "Like new", good: "Good", fair: "Fair" };
