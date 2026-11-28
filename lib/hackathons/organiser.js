// Who is organising a hackathon, and how to show it. A club's name and its organiser are the same thing for most clubs, so the
// organiser's name follows the club the admin picks. The IEEE societies are different: the society is the club, but the
// organiser is the IEEE student branch it belongs to, so that name is typed by the admin. A hackathon by another college has
// no club at all: the organiser's name (for example "CMR Institute of Technology") is the whole answer.

export const OUT_OF_COLLEGE = "Out of college: another college or organisation";

const key = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
export const isIeee = (name) => /^IEEE\b/i.test(String(name ?? "").trim());

/**
 * What the organiser field should hold after the admin changes the club.
 * It follows the club's name while it is empty or still shows the previous club's name; a name the admin typed is never overwritten.
 * @param current  the organiser field now
 * @param prev     the club that was selected before, or null
 * @param next     the club that was just selected, or null ("out of college")
 */
export function organiserAfterClubChange(current, prev, next) {
  const typedByAdmin = current && key(current) !== key(prev?.name);
  if (typedByAdmin) return current;
  if (!next || isIeee(next.name)) return "";        // out of college, or an IEEE society: the admin types the organiser
  return next.name;
}

/** "Coding Club", "IEEE Computer Society · IEEE BMSIT Student Branch", "CMR Institute of Technology". */
export function organiserLine({ club, organizer_name: organizer } = {}) {
  const c = club?.name || "";
  const o = String(organizer ?? "").trim();
  if (c && o && key(o) !== key(c) && !key(o).includes(key(c))) return `${c} · ${o}`;
  return c || o || "";
}
