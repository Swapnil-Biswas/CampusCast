// Test helpers: shaped like what the model returns through the record_examination_notice tool.

export const DEPTS = [
  { name: "Computer Science & Engineering", code: "CSE" },
  { name: "AI & Machine Learning", code: "AI&ML" },
  { name: "Information Science & Engineering", code: "ISE" },
  { name: "Civil Engineering", code: "CIVIL" },
];

// A notice-level field the way the model reports it.
export const F = (value, source = "explicit", confidence = 0.95, pages = [1], evidence = "") => ({
  value, source, confidence, pages, evidence: evidence || (typeof value === "string" ? value : ""),
});
export const MISSING = () => ({ value: null, source: "missing", confidence: 0, pages: [], evidence: "" });

export const row = (over = {}) => ({
  subjectName: "Data Structures", subjectCode: "21CS32", department: "AI & Machine Learning", semester: 2,
  originalExamName: "CIE 2", examDate: "2026-12-10", dateText: "10/12/2026", startTime: "10:00", endTime: "11:30",
  session: "FN", reportingTime: null, notes: null, page: 1, confidence: 0.95, ...over,
});

// A clean IA 2 timetable for AI & ML, semester 2.
export const goodRaw = (over = {}) => ({
  documentKind: "digital",
  notice: {
    title: F("Time Table for CIE 2 Examinations"),
    noticeType: F("timetable"),
    originalExamName: F("CIE 2"),
    category: F("ia2", "explicit", 0.95, [1], "CIE 2"),
    specialKind: MISSING(),
    departments: F(["AI & Machine Learning"], "explicit", 0.9, [1], "Dept. of AIML"),
    semesters: F([2], "explicit", 0.95, [1], "II Semester"),
    academicYear: F("2026-27"),
    regulation: F("2025 scheme"),
    degreeProgramme: F("B.E."),
    notificationDate: F("2026-11-20"),
    ...over,
  },
  importantDates: [{ label: "Hall tickets", date: "2026-12-05", dateText: "05/12/2026", page: 1 }],
  timetable: [row(), row({ subjectName: "Mathematics", subjectCode: "21MA31", examDate: "2026-12-12", dateText: "12/12/2026", page: 2 })],
  instructions: {
    examination: [{ text: "Carry the college ID card.", page: 2 }],
    hallTicket: [], requiredDocuments: [], important: [{ text: "No mobile phones.", page: 2 }], other: [],
  },
});

// The same notice with no examination wording anywhere (not in the title, the exam name or the rows),
// so the category cannot be worked out from the text.
export const noWordingRaw = (catOver = {}) => {
  const raw = goodRaw({ originalExamName: MISSING(), category: MISSING(), title: F("Examination notice"), ...catOver });
  raw.timetable = raw.timetable.map((r) => ({ ...r, originalExamName: null }));
  return raw;
};

// A minimal valid-looking PDF as bytes.
export const pdfBytes = (body = "") => Buffer.from(
  `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>\nendobj\n` +
  `3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n4 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n${body}trailer\n<< /Root 1 0 R >>\n%%EOF\n`, "latin1");
