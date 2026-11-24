"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Search, X } from "lucide-react";
import { NAV, ROLE_LABEL, shortBranch } from "../../lib/dash/meta";
import { NAV_ICONS } from "./icons";
import NotificationBell from "./Bell";
import { signOut } from "../../app/auth/actions";

export default function Shell({ user, unread, children }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => setOpen(false), [path]);

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.super || user.role === "super_admin") && (!i.admin || isAdmin || (i.href.endsWith("/compose") && user.leadsClub))) }))
    .filter((g) => g.items.length);
  const active = (i) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const tabs = ["/dashboard", "/dashboard/calendar", "/dashboard/connect", "/dashboard/notes", "/dashboard/saved"];

  const search = (e) => { e.preventDefault(); router.push(`/dashboard?q=${encodeURIComponent(q.trim())}`); };

  return (
    <div className="dash">
      <aside className={"dash-side" + (open ? " open" : "")} aria-label="Dashboard navigation">
        <Link href="/" className="dash-brand">Campus<i>Cast</i></Link>
        <button className="icon-btn dash-close" aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button>
        <nav>
          {groups.map((g) => (
            <div className="nav-group" key={g.group}>
              <p>{g.group}</p>
              {g.items.map((i) => {
                const Icon = NAV_ICONS[i.icon];
                return <Link key={i.href} href={i.href} className={active(i) ? "on" : ""} aria-current={active(i) ? "page" : undefined}><Icon size={18} /> {i.label}</Link>;
              })}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <Link href="/dashboard/profile" className="avatar" aria-label="Your profile">{(user.name || "?").slice(0, 1).toUpperCase()}</Link>
          <Link href="/dashboard/profile" className="who"><b>{user.name}</b><small>{shortBranch(user.branch)} · Year {user.year}{user.role !== "student" ? ` · ${ROLE_LABEL[user.role]}` : ""}</small></Link>
          <form action={signOut}><button className="icon-btn" aria-label="Sign out" title="Sign out"><LogOut size={18} /></button></form>
        </div>
      </aside>
      {open && <div className="dash-scrim" onClick={() => setOpen(false)} />}

      <div className="dash-body">
        <header className="dash-top">
          <button className="icon-btn dash-burger" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <form className="dash-search" onSubmit={search} role="search">
            <Search size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notices, exams, deadlines…" aria-label="Search notices" />
          </form>
          <NotificationBell userId={user.id} initialUnread={unread} />
          <Link href="/dashboard/profile" className="avatar sm" aria-label="Your profile">{(user.name || "?").slice(0, 1).toUpperCase()}</Link>
        </header>
        <main className="dash-main" id="main">{children}</main>
      </div>

      <nav className="tabbar" aria-label="Quick navigation">
        {tabs.map((href) => {
          const item = NAV.flatMap((g) => g.items).find((i) => i.href === href);
          const Icon = NAV_ICONS[item.icon];
          return <Link key={href} href={href} className={active(item) ? "on" : ""}><Icon size={20} /><span>{item.label.split(" ")[0]}</span></Link>;
        })}
      </nav>
    </div>
  );
}
