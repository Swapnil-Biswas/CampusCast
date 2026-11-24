import Link from "next/link";
import { requireVerified } from "../../../lib/dash/ctx";
import { XCHANGE_CATEGORIES as CATEGORIES, XCHANGE_CONDITIONS as CONDITIONS, timeAgo } from "../../../lib/dash/meta";
import { Chat, ListingForm, OwnListingControls, Respond } from "../../../components/dashboard/XchangeUI";
import { ReportBlock, RequestBox } from "../../../components/dashboard/Common";
import { Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "CampusXchange" };
const TABS = [["browse", "Browse"], ["mine", "My listings"], ["chats", "Requests & chats"]];

export default async function Xchange({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "browse";
  const f = { q: one(sp.q).trim(), category: one(sp.category), max: one(sp.max) };
  const { supabase, user } = await requireVerified();
  const nowIso = new Date().toISOString();

  let q = supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(60);
  q = tab === "mine" ? q.eq("seller_id", user.id) : q.eq("status", "active").gt("expires_at", nowIso).neq("seller_id", user.id);
  if (f.category) q = q.eq("category", f.category);
  if (f.max) q = q.lte("price", Number(f.max));
  if (f.q) q = q.ilike("title", `%${f.q.replace(/[%,]/g, "")}%`);
  const [{ data: listings, error }, { data: sent }, { data: received }] = await Promise.all([
    tab === "chats" ? Promise.resolve({ data: [] }) : q,
    supabase.from("listing_requests").select("*").eq("buyer_id", user.id).order("created_at", { ascending: false }),
    supabase.from("listing_requests").select("*, listings!inner(title,seller_id)").eq("listings.seller_id", user.id).order("created_at", { ascending: false }),
  ]);

  const reqIds = [...(sent || []), ...(received || [])].filter((r) => r.status === "accepted").map((r) => r.id);
  const lIds = [...new Set((sent || []).map((r) => r.listing_id))];
  const [{ data: msgs }, { data: sentListings }] = await Promise.all([
    reqIds.length ? supabase.from("messages").select("*").in("request_id", reqIds).order("created_at") : Promise.resolve({ data: [] }),
    lIds.length ? supabase.from("listings").select("id,title,seller_id").in("id", lIds) : Promise.resolve({ data: [] }),
  ]);
  const people = [...new Set([...(received || []).map((r) => r.buyer_id), ...(sentListings || []).map((l) => l.seller_id), ...(listings || []).map((l) => l.seller_id)])];
  const { data: names } = people.length ? await supabase.rpc("author_names", { p_ids: people }) : { data: [] };
  const who = new Map((names || []).map((p) => [p.id, p]));
  const lById = new Map((sentListings || []).map((l) => [l.id, l]));
  const mine = new Map((sent || []).map((r) => [r.listing_id, r]));
  const chatOf = (id) => (msgs || []).filter((m) => m.request_id === id);

  // Photos sit in a private bucket: sign the first image of each listing.
  const photo = new Map();
  await Promise.all((listings || []).filter((l) => l.images?.[0]?.path).map(async (l) => {
    const { data: s } = await supabase.storage.from("listing-images").createSignedUrl(l.images[0].path, 3600);
    if (s) photo.set(l.id, s.signedUrl);
  }));
  const pendingIn = (received || []).filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="page-head">
        <div><h1>CampusXchange</h1><p>Buy and sell with students on campus. Chat opens only after the seller accepts your request.</p></div>
        <ListingForm userId={user.id} />
      </div>
      <Tabs tabs={TABS.map(([v, l]) => [v, v === "chats" && pendingIn ? `${l} (${pendingIn} new)` : l])} current={tab} base="/dashboard/xchange" />

      {tab === "browse" && (
        <form className="filters" method="get" role="search">
          <label className="sel"><span>Search</span><input name="q" defaultValue={f.q} placeholder="book, cycle, lamp…" /></label>
          <label className="sel"><span>Category</span><select name="category" defaultValue={f.category}><option value="">All</option>{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="sel"><span>Max ₹</span><input name="max" type="number" min={0} defaultValue={f.max} style={{ width: 90 }} /></label>
          <button className="chip on">Search</button>
          {(f.q || f.category || f.max) && <Link className="link-btn" href="/dashboard/xchange">Clear</Link>}
        </form>
      )}
      {error && <p className="form-msg err">{error.message}</p>}

      {tab === "chats" ? (
        <div className="feed">
          {!(sent?.length || received?.length) && <div className="empty"><h2>No requests yet</h2><p>Requests you send and receive, and the chats they open, appear here.</p></div>}
          {(received || []).map((r) => (
            <article key={r.id} className="notice" style={{ "--u": r.status === "accepted" ? "#7fb48a" : "#f3b63f" }}>
              <div className="notice-top"><span className="pill soft" style={{ "--c": "#f3b63f" }}>{r.status}</span><span className="when">Buyer request</span></div>
              <h3 className="notice-title">{r.listings.title}</h3>
              <p className="audience">From {who.get(r.buyer_id)?.full_name || "a student"}</p><p>“{r.message}”</p>
              {r.status === "pending" && <div className="notice-actions"><Respond id={r.id} /></div>}
              {r.status === "accepted" && <Chat requestId={r.id} me={user.id} initial={chatOf(r.id)} />}
            </article>
          ))}
          {(sent || []).map((r) => (
            <article key={r.id} className="notice" style={{ "--u": r.status === "accepted" ? "#7fb48a" : "#8ec5d6" }}>
              <div className="notice-top"><span className="pill soft" style={{ "--c": "#8ec5d6" }}>{r.status}</span><span className="when">Your request</span></div>
              <h3 className="notice-title">{lById.get(r.listing_id)?.title || "A listing"}</h3>
              <p className="audience">Seller: {who.get(lById.get(r.listing_id)?.seller_id)?.full_name || "a student"}</p>
              {r.status === "pending" && <p className="inline-msg">Waiting for the seller to accept.</p>}
              {r.status === "declined" && <p className="inline-msg">The seller declined this request.</p>}
              {r.status === "accepted" && <Chat requestId={r.id} me={user.id} initial={chatOf(r.id)} />}
            </article>
          ))}
        </div>
      ) : !listings?.length ? (
        <div className="empty"><h2>{tab === "mine" ? "You have nothing listed" : "No listings match"}</h2><p>{tab === "mine" ? "List a book, cycle or hostel item in under a minute." : "Try a different search, or be the first to list."}</p></div>
      ) : (
        <div className="feed">{listings.map((l) => {
          const own = l.seller_id === user.id, req = mine.get(l.id);
          return (
            <article key={l.id} className="notice" style={{ "--u": l.status === "active" ? "#7fb48a" : "#bbb" }}>
              {photo.get(l.id) && <img src={photo.get(l.id)} alt={l.title} style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />}
              <div className="notice-top">
                <span className="pill soft" style={{ "--c": "#7fb48a" }}>{CATEGORIES[l.category]}</span>
                <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{CONDITIONS[l.condition]}</span>
                {l.status !== "active" && <span className="pill soft" style={{ "--c": "#bbb" }}>{l.status}</span>}
                <span className="when">{timeAgo(l.created_at)}</span>
              </div>
              <h3 className="notice-title">{l.title} · {l.price === 0 ? "Free" : `₹${l.price}`}</h3>
              <p className="audience">{own ? "You" : who.get(l.seller_id)?.full_name || "A student"}{own && l.status === "active" ? ` · expires ${new Date(l.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</p>
              {l.description && <p style={{ whiteSpace: "pre-wrap" }}>{l.description}</p>}
              <div className="notice-actions">
                {own ? <OwnListingControls id={l.id} status={l.status} /> : req ? <span className="inline-msg">You asked ({req.status}). See Requests &amp; chats.</span>
                  : <RequestBox kind="listing" id={l.id} placeholder="Is it still available?" button="Ask the seller" done="Sent. The seller will be notified." />}
                {!own && <ReportBlock kind="listing" refId={l.id} ownerId={l.seller_id} />}
              </div>
            </article>
          );
        })}</div>
      )}
    </>
  );
}
