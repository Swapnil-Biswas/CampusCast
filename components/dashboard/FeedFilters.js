"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { CATEGORIES, URGENCY, shortBranch } from "../../lib/dash/meta";
import { BRANCHES, YEARS } from "../../lib/college";

// Filters live in the URL, so a filtered feed can be bookmarked or shared.
export default function FeedFilters({ clubs, show = ["category", "urgency", "dept", "year", "club", "unread", "saved"] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const get = (k) => sp.get(k) || "";
  const set = (k, v) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    next.delete("open");
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  const active = ["q", "category", "urgency", "dept", "year", "club", "unread", "saved"].some((k) => get(k));
  const Select = ({ k, label, children }) => (
    <label className="sel"><span>{label}</span>
      <select value={get(k)} onChange={(e) => set(k, e.target.value)}><option value="">All</option>{children}</select>
    </label>
  );

  return (
    <div className="filters" role="group" aria-label="Filter notices">
      {get("q") && <button className="chip on" onClick={() => set("q", "")}>Search: “{get("q")}” <X size={14} /></button>}
      {show.includes("urgency") && (
        <div className="seg" role="group" aria-label="Urgency">
          {URGENCY.map((u) => (
            <button key={u.id} className={get("urgency") === String(u.id) ? "on" : ""} style={{ "--c": u.color }} aria-pressed={get("urgency") === String(u.id)}
              onClick={() => set("urgency", get("urgency") === String(u.id) ? "" : String(u.id))}>{u.label}</button>
          ))}
        </div>
      )}
      {show.includes("category") && <Select k="category" label="Category">{Object.entries(CATEGORIES).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}</Select>}
      {show.includes("dept") && <Select k="dept" label="Department">{BRANCHES.map((b) => <option key={b} value={b}>{shortBranch(b)}</option>)}</Select>}
      {show.includes("year") && <Select k="year" label="Year">{YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}</Select>}
      {show.includes("club") && clubs?.length > 0 && <Select k="club" label="Club">{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      {show.includes("unread") && <button className={"chip" + (get("unread") ? " on" : "")} aria-pressed={!!get("unread")} onClick={() => set("unread", get("unread") ? "" : "1")}>Unread only</button>}
      {show.includes("saved") && <button className={"chip" + (get("saved") ? " on" : "")} aria-pressed={!!get("saved")} onClick={() => set("saved", get("saved") ? "" : "1")}>Saved only</button>}
      {active && <button className="link-btn" onClick={() => router.replace(path, { scroll: false })}>Clear all</button>}
    </div>
  );
}
