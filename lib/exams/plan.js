// Decides what to write into the draft notice and its timetable rows after an extraction finishes.
// Pure function: no database access, so it can be tested on its own.
//
// Automatic filling happens once, on the first extraction of a draft. After that the admin's edits are never
// overwritten (re-applying is an explicit action). Nothing here publishes anything.

/**
 * @param notice  { id, title, audience_depts, degree_programme, details }  current draft notice row
 * @param norm    the result of normalizeExtraction() (.result, .warnings)
 * @param opts    { extractionId, hasEntries, force, now }
 * @returns { skip: true } | { noticePatch, entries, warnings }
 */
export function planApply(notice, norm, { extractionId, hasEntries = false, force = false, now = new Date() } = {}) {
  if (!force && notice.details?.extraction?.autofilled) return { skip: true };
  const r = norm.result;
  const warnings = [...norm.warnings];
  const audience = notice.audience_depts || [];

  const extra = r.departments.filter((d) => !audience.includes(d));
  if (extra.length) {
    warnings.push({
      field: "departments", code: "department_mismatch",
      message: `The PDF mentions ${extra.join(", ")}, but this notice is set up for ${audience.join(", ")}. Check that you uploaded it for the right department.`,
    });
  }

  const put = (obj, key, value) => { if (value !== null && value !== undefined) obj[key] = value; };
  const noticePatch = {};
  put(noticePatch, "title", r.title);
  put(noticePatch, "notice_type", r.noticeType);
  put(noticePatch, "category", r.categoryCode);
  put(noticePatch, "special_kind", r.categoryCode === "special" ? r.specialKind : null);
  put(noticePatch, "original_exam_name", r.originalExaminationName);
  put(noticePatch, "semesters", r.semesters.length ? r.semesters : null);
  put(noticePatch, "academic_year", r.academicYear);
  put(noticePatch, "regulation", r.regulation);
  put(noticePatch, "notification_date", r.notificationDate);
  put(noticePatch, "degree_programme", r.degreeProgramme);
  noticePatch.details = {
    ...(notice.details || {}),
    importantDates: r.importantDates,
    instructions: r.instructions,
    extraction: { autofilled: true, extractionId, requiresReview: true, warnings, appliedAt: now.toISOString() },
  };

  const entries = [];
  if (!hasEntries || force) {
    const soleSemester = r.semesters.length === 1 ? r.semesters[0] : null;
    let outside = 0;
    r.timetable.forEach((row, i) => {
      const deptOutside = row.department && !audience.includes(row.department);
      if (deptOutside) outside++;
      entries.push({
        notice_id: notice.id,
        department: row.department,
        semester: row.semester ?? soleSemester,
        category: r.categoryCode,
        original_exam_name: row.originalExamName ?? r.originalExaminationName,
        subject_name: row.subjectName,
        subject_code: row.subjectCode,
        exam_date: row.examDate,
        start_time: row.startTime,
        end_time: row.endTime,
        session: row.session,
        reporting_time: row.reportingTime,
        notes: row.notes,
        source_page: row.page,
        confidence: Math.round(row.confidence * 100) / 100,
        needs_review: row.needsReview || deptOutside,
        sort: i,
      });
    });
    if (outside) warnings.push({ field: "timetable", code: "rows_outside_audience", message: `${outside} timetable row(s) are for a department this notice is not set up for.` });
  }
  return { noticePatch, entries, warnings };
}
