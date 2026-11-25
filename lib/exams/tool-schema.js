import { CATEGORY_CODES, NOTICE_TYPES, SOURCES, SPECIAL_KINDS } from "./constants.js";

// The JSON structure the model must return (as the input of a forced tool call).
// Every notice-level field is wrapped with where the value came from, so the admin can see
// what the PDF states, what was inferred, and what is missing.

const provenance = {
  source: { type: "string", enum: SOURCES, description: "explicit = written in the PDF; inferred = deduced from context; missing = not in the PDF (then value must be null)." },
  confidence: { type: "number", minimum: 0, maximum: 1, description: "How sure you are about this value, 0 to 1." },
  pages: { type: "array", items: { type: "integer", minimum: 1 }, description: "1-based page numbers where the evidence appears." },
  evidence: { type: "string", description: "A short verbatim quote (under 200 characters) from the PDF that supports the value. Empty if missing." },
};

export const field = (valueSchema, description) => ({
  type: "object",
  description,
  properties: { value: valueSchema, ...provenance },
  required: ["value", "source", "confidence", "pages", "evidence"],
  additionalProperties: false,
});

export const nullable = (type, extra = {}) => ({ type: [type, "null"], ...extra });

const textItems = (description) => ({
  type: "array",
  description,
  items: {
    type: "object",
    properties: { text: { type: "string" }, page: nullable("integer") },
    required: ["text", "page"],
    additionalProperties: false,
  },
});

export const EXTRACTION_TOOL = {
  name: "record_examination_notice",
  description: "Record the information found in an official college examination PDF. Use null for anything the document does not state.",
  input_schema: {
    type: "object",
    properties: {
      documentKind: { type: ["string", "null"], enum: ["digital", "scanned", "mixed", null], description: "Whether the pages are typed text, scanned images, or both." },
      notice: {
        type: "object",
        properties: {
          title: field(nullable("string"), "The title or subject line of the notice, as written."),
          noticeType: field({ type: ["string", "null"], enum: [...NOTICE_TYPES, null] }, "timetable = a schedule of exams; notification = a general exam notice; guidelines = rules/instructions; result = result announcement; circular = other circular."),
          originalExamName: field(nullable("string"), "The examination name EXACTLY as written, for example 'CIE 2', 'IA-1', 'SEE', 'Semester End Examination'. Do not rewrite it."),
          category: field({ type: ["string", "null"], enum: [...CATEGORY_CODES, null] }, "ia1/ia2/ia3 for the first/second/third internal assessment (CIE 1/2/3), final for the end-of-semester examination (SEE). special for supplementary, practical, laboratory, revaluation or other special examinations. null if the PDF does not make it clear."),
          specialKind: field({ type: ["string", "null"], enum: [...SPECIAL_KINDS, null] }, "Only when category is special."),
          departments: field({ type: "array", items: { type: "string" } }, "Departments the notice is for. Use the exact names from the configured list you were given; use an empty array if the PDF does not say."),
          semesters: field({ type: "array", items: { type: "integer", minimum: 1, maximum: 8 } }, "Semesters the notice is for, as numbers 1 to 8."),
          academicYear: field(nullable("string"), "Academic year as printed, for example '2026-27'."),
          regulation: field(nullable("string"), "Regulation / scheme, for example '2022 scheme'."),
          degreeProgramme: field(nullable("string"), "For example 'B.E.' or 'B.Tech'."),
          notificationDate: field(nullable("string"), "The date of the notice, as YYYY-MM-DD. Dates in Indian notices are day-first (12/11/2026 is 12 November 2026)."),
        },
        required: ["title", "noticeType", "originalExamName", "category", "specialKind", "departments", "semesters", "academicYear", "regulation", "degreeProgramme", "notificationDate"],
        additionalProperties: false,
      },
      importantDates: {
        type: "array",
        description: "Other dated events in the notice (registration deadline, hall ticket release, ...), not the exam rows.",
        items: {
          type: "object",
          properties: { label: { type: "string" }, date: nullable("string", { description: "YYYY-MM-DD" }), dateText: { type: "string", description: "The date as printed." }, page: nullable("integer") },
          required: ["label", "date", "dateText", "page"],
          additionalProperties: false,
        },
      },
      timetable: {
        type: "array",
        description: "One entry per exam row of a timetable. Empty if the PDF has no timetable. Include every row on every page.",
        items: {
          type: "object",
          properties: {
            subjectName: nullable("string"),
            subjectCode: nullable("string"),
            department: nullable("string", { description: "Exact name from the configured list, if the row states one." }),
            semester: nullable("integer"),
            originalExamName: nullable("string"),
            examDate: nullable("string", { description: "YYYY-MM-DD" }),
            dateText: { type: "string", description: "The date exactly as printed in the PDF." },
            startTime: nullable("string", { description: "24-hour HH:MM" }),
            endTime: nullable("string", { description: "24-hour HH:MM" }),
            session: nullable("string", { description: "For example FN / AN, as written." }),
            reportingTime: nullable("string", { description: "24-hour HH:MM, only if stated." }),
            notes: nullable("string"),
            page: nullable("integer"),
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["subjectName", "subjectCode", "department", "semester", "originalExamName", "examDate", "dateText", "startTime", "endTime", "session", "reportingTime", "notes", "page", "confidence"],
          additionalProperties: false,
        },
      },
      instructions: {
        type: "object",
        properties: {
          examination: textItems("Examination guidelines and rules."),
          hallTicket: textItems("Hall ticket instructions."),
          requiredDocuments: textItems("Documents students must bring."),
          important: textItems("Important notices."),
          other: textItems("Any other instructions."),
        },
        required: ["examination", "hallTicket", "requiredDocuments", "important", "other"],
        additionalProperties: false,
      },
    },
    required: ["documentKind", "notice", "importantDates", "timetable", "instructions"],
    additionalProperties: false,
  },
};
