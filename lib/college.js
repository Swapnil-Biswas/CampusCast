// College email rule. The authoritative check is public.is_college_email() in
// supabase/setup.sql (it also knows extra domains added in the database).
// This copy is the fallback used when that function isn't installed yet.
export const COLLEGE_DOMAINS = ["bmsit.in"];

export function looksLikeCollegeEmail(email) {
  const domain = String(email || "").toLowerCase().split("@")[1] || "";
  return (
    COLLEGE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`)) ||
    /\.edu$/.test(domain) || /\.edu\.[a-z]{2}$/.test(domain) || /\.ac\.[a-z]{2}$/.test(domain)
  );
}

export async function isCollegeEmail(supabase, email) {
  const { data, error } = await supabase.rpc("is_college_email", { email });
  if (error) return looksLikeCollegeEmail(email);
  return data === true;
}

export const COLLEGE_EMAIL_ERROR =
  "Please use your college email (for example 25ug1byai282@bmsit.in). Personal emails like Gmail can't be used.";

// VTU branch codes, as they appear in BMSIT student emails and USNs.
export const BRANCH_CODES = {
  ai: "AI & Machine Learning",
  cs: "Computer Science & Engineering",
  cv: "Civil Engineering",
  is: "Information Science & Engineering",
  ad: "AI & Data Science",
  cb: "Computer Science & Business Systems",
  ec: "Electronics & Communication Engineering",
  ee: "Electrical & Electronics Engineering",
  te: "Electronics & Telecommunication Engineering",
  me: "Mechanical Engineering",
};

export const BRANCHES = [...Object.values(BRANCH_CODES), "Other"];
export const YEARS = [1, 2, 3, 4, 5];

// Year of study for a batch: the academic year starts in August, so a 2025 batch
// is in year 1 from Aug 2025 to Jul 2026 and in year 2 from Aug 2026.
export function yearOfStudy(batch, now = new Date()) {
  const academicStart = now.getFullYear() - (now.getMonth() < 7 ? 1 : 0);
  return Math.min(5, Math.max(1, academicStart - batch + 1));
}

// Reads a BMSIT student email such as 25ug1byai282@bmsit.in:
//   25 = batch (joined 2025), ug = undergraduate, 1by = BMSIT college code,
//   ai = branch code, 282 = roll number. Together they form the USN 1BY25AI282.
// Returns null for any other email (staff, other colleges), which then fill the form by hand.
export function parseStudentEmail(email) {
  const m = /^(\d{2})(ug|pg)(\d[a-z]{2})([a-z]{2})(\d{3})@bmsit\.in$/.exec(String(email || "").trim().toLowerCase());
  if (!m) return null;
  const [, yy, level, college, code, roll] = m;
  const batch = 2000 + Number(yy);
  return {
    batch,
    level,
    branchCode: code,
    branch: BRANCH_CODES[code] ?? null,
    year: yearOfStudy(batch),
    usn: `${college}${yy}${code}${roll}`.toUpperCase(),
  };
}
