// One description per admin-managed record. The form renders from it and the server action validates against it,
// so only these columns can ever be written from the browser.
export const RECORDS = {
  exams: {
    label: "exam", bucket: "announcement-files", audience: true,
    fields: [
      { k: "kind", t: "select", label: "Type", options: [["exam", "Exam"], ["timetable", "Timetable"], ["result", "Results"]], def: "exam" },
      { k: "title", t: "text", label: "Title", req: true, ph: "e.g. Data Structures mid-term" },
      { k: "course_code", t: "text", label: "Course code", ph: "e.g. 23CS3PCDST" },
      { k: "exam_at", t: "datetime", label: "Date and time", help: "Required for exams. Changing this or the venue alerts students as Now.", only: ["exam"] },
      { k: "duration_min", t: "number", label: "Duration (minutes)", min: 5, max: 600, only: ["exam"] },
      { k: "venue", t: "text", label: "Venue", only: ["exam"] },
      { k: "notes", t: "textarea", label: "Notes" },
      { k: "file", t: "file", label: "Attachment (PDF or image)", help: "Timetable or results document." },
    ],
  },
  workshops: {
    label: "workshop", bucket: "announcement-files", audience: true, club: true,
    fields: [
      { k: "title", t: "text", label: "Title", req: true },
      { k: "description", t: "textarea", label: "What will students learn?" },
      { k: "starts_at", t: "datetime", label: "Starts", req: true },
      { k: "ends_at", t: "datetime", label: "Ends" },
      { k: "venue", t: "text", label: "Venue" },
      { k: "seats", t: "number", label: "Seats", req: true, min: 1, max: 5000, def: 50, help: "When full, new sign-ups join a waitlist and move up automatically." },
      { k: "reg_closes_at", t: "datetime", label: "Registration closes" },
    ],
  },
  hackathons: {
    label: "hackathon", bucket: "announcement-files", club: true,
    fields: [
      { k: "title", t: "text", label: "Name", req: true },
      { k: "theme", t: "text", label: "Theme", req: true, def: "Open innovation", ph: "AI, Web3, Sustainability…" },
      { k: "mode", t: "select", label: "Mode", options: [["offline", "On campus"], ["online", "Online"], ["hybrid", "Hybrid"]], def: "offline" },
      { k: "description", t: "textarea", label: "Details" },
      { k: "location", t: "text", label: "Location" },
      { k: "starts_at", t: "datetime", label: "Starts" },
      { k: "deadline", t: "datetime", label: "Registration deadline", req: true },
      { k: "team_min", t: "number", label: "Smallest team", min: 1, max: 10, def: 1 },
      { k: "team_max", t: "number", label: "Largest team", min: 1, max: 10, def: 4 },
      { k: "prize", t: "text", label: "Prize" },
      { k: "link", t: "url", label: "Registration link" },
    ],
  },
  events: {
    label: "event", bucket: "event-media", club: true,
    fields: [
      { k: "title", t: "text", label: "Title", req: true },
      { k: "description", t: "textarea", label: "About the event" },
      { k: "starts_at", t: "datetime", label: "Starts", req: true },
      { k: "venue", t: "text", label: "Venue" },
      { k: "poster", t: "file", label: "Poster (image)", help: "JPG, PNG or WebP up to 8 MB." },
    ],
  },
};

// Turns what the browser sent into a clean row. Returns { row } or { error }.
export function cleanRecord(table, input) {
  const cfg = RECORDS[table];
  if (!cfg) return { error: "Unknown record type." };
  const row = {};
  const kind = input.kind;
  for (const f of cfg.fields) {
    if (f.only && !f.only.includes(kind)) { row[f.k] = null; continue; }
    let v = input[f.k];
    if (v === "" || v === undefined) v = null;
    if (v === null) {
      if (f.req) return { error: `${f.label} is required.` };
      row[f.k] = f.t === "file" ? null : null;
      continue;
    }
    if (f.t === "number") { v = Number(v); if (!Number.isFinite(v) || (f.min != null && v < f.min) || (f.max != null && v > f.max)) return { error: `${f.label} must be between ${f.min} and ${f.max}.` }; }
    else if (f.t === "datetime") { const d = new Date(v); if (isNaN(d)) return { error: `${f.label} is not a valid date.` }; v = d.toISOString(); }
    else if (f.t === "select") { if (!f.options.some(([o]) => o === v)) return { error: `${f.label} is not valid.` }; }
    else if (f.t === "url") { try { const u = new URL(String(v)); if (!/^https?:$/.test(u.protocol)) throw 0; v = u.toString(); } catch { return { error: `${f.label} must be a web address starting with https://` }; } }
    else if (f.t === "file") { if (typeof v?.path !== "string") return { error: "Attachment is not valid." }; v = { name: String(v.name || "file").slice(0, 120), path: v.path, size: Number(v.size) || null, type: String(v.type || "") }; }
    else v = String(v).trim().slice(0, f.t === "textarea" ? 4000 : 300);
    row[f.k] = v;
  }
  if (table === "hackathons" && row.team_min > row.team_max) return { error: "Smallest team cannot be bigger than the largest." };
  if (table === "workshops" && row.ends_at && row.ends_at < row.starts_at) return { error: "A workshop cannot end before it starts." };
  if (cfg.audience) {
    const d = (input.audience_depts || []).map(String), y = (input.audience_years || []).map(Number).filter((n) => n >= 1 && n <= 5);
    row.audience_depts = d.length ? d : null;
    row.audience_years = y.length ? y : null;
  }
  if (cfg.club) row.club_id = input.club_id || null;
  return { row };
}
