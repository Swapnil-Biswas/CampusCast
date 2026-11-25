// Decides what to write into a DRAFT hackathon after the AI has read its poster. Pure function: no database access.
// It fills the draft once (the first reading); after that the club admin's edits are never overwritten.
// It never touches status, created_by or the club the admin chose, and nothing here publishes anything.

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

/**
 * @param hackathon  { id, club_id, team_min, team_max, starts_at, deadline, details }  the current draft row
 * @param norm       the result of normalizeHackathon() (.result, .warnings)
 * @param opts       { extractionId, clubs: [{ id, name }], now, force }
 * @returns { skip: true } | { patch, warnings }
 */
export function planHackathonApply(hackathon, norm, { extractionId, clubs = [], now = new Date(), force = false } = {}) {
  if (!force && hackathon.details?.extraction?.autofilled) return { skip: true };
  const r = norm.result;
  const warnings = [...norm.warnings];
  const patch = {};
  const put = (k, v) => { if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== "") patch[k] = v; };

  put("title", r.name);
  put("tagline", r.tagline);
  put("organizer_name", r.organizerName);
  put("theme", r.theme);
  put("mode", r.mode);
  put("location", r.venue);
  put("map_url", r.mapUrl);
  put("venue_address", r.venueAddress);
  if (r.offCampus) patch.off_campus = true;
  if (r.offCampus && r.venuePin) {
    patch.venue_lat = r.venuePin.lat; patch.venue_lng = r.venuePin.lng;
    patch.route_km = r.venuePin.km; patch.route_minutes = r.venuePin.minutes; patch.route_source = r.venuePin.source;
  }
  put("starts_at", r.startsAt);
  put("ends_at", r.endsAt);
  put("registration_opens_at", r.registrationOpensAt);
  put("deadline", r.deadline);
  put("prize", r.prizeText || (r.prizeAmount ? rupees(r.prizeAmount) : null));
  put("prize_amount", r.prizeAmount);
  put("prize_breakdown", r.prizes);
  put("fee_amount", r.feeAmount);
  put("fee_note", r.feeNote);
  put("eligibility", r.eligibility);
  put("tracks", r.tracks);
  put("contact_name", r.contactName);
  put("contact_phone", r.contactPhone);
  put("contact_email", r.contactEmail);
  put("website_url", r.websiteUrl);
  put("link", r.registrationUrl);
  put("schedule", r.schedule.map(({ at, endAt, title, note, needsReview }) => ({ at, endAt, title, note, ...(needsReview ? { needsReview: true } : {}) })));

  // Keep the database's own rules true when only some of the values are filled in.
  if (r.teamMin) patch.team_min = r.teamMin;
  if (r.teamMax) patch.team_max = r.teamMax;
  const effMin = patch.team_min ?? hackathon.team_min ?? 1, effMax = patch.team_max ?? hackathon.team_max ?? 4;
  if (effMin > effMax) { if (patch.team_min) patch.team_max = effMin; else patch.team_min = effMax; }
  const starts = patch.starts_at ?? hackathon.starts_at, ends = patch.ends_at;
  if (ends && starts && new Date(ends) < new Date(starts)) delete patch.ends_at;
  const opens = patch.registration_opens_at, closes = patch.deadline ?? hackathon.deadline;
  if (opens && closes && new Date(opens) > new Date(closes)) delete patch.registration_opens_at;

  // The club is chosen by the person who uploaded; it is only filled in when none was chosen and the poster names one.
  if (!hackathon.club_id && r.clubName) {
    const c = clubs.find((x) => x.name === r.clubName);
    if (c) patch.club_id = c.id;
  }

  patch.details = {
    ...(hackathon.details || {}),
    perks: r.perks, rules: r.rules, sponsors: r.sponsors,
    extraction: { autofilled: true, extractionId, requiresReview: true, warnings, qrLinks: r.qrLinks || [], appliedAt: now.toISOString() },
  };
  return { patch, warnings };
}
