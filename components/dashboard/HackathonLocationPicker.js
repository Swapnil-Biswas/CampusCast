"use client";
import { useState } from "react";
import { ExternalLink, LoaderCircle, MapPin, Search, Trash2 } from "lucide-react";
import { locateVenue } from "../../app/dashboard/hackathons/manage/actions";
import { CAMPUS, formatKm, isPin, osmEmbedUrl, placeUrl, routeSummary, straightKm } from "../../lib/hackathons/geo";

// For a hackathon outside BMSIT: the admin finds the venue on the map (by name, or from a pasted Google Maps link), sees the
// pin on a real map to be sure it is the right place, and saves. The road distance from BMSIT is measured when the form is saved.
export default function HackathonLocationPicker({ venueName, venueAddress, lat, lng, saved, flagged, onPick, onClear }) {
  const [query, setQuery] = useState([venueName, venueAddress].filter(Boolean).join(", "));
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(null);
  const [places, setPlaces] = useState(null);
  const [err, setErr] = useState("");

  const la = lat === "" || lat == null ? NaN : Number(lat), ln = lng === "" || lng == null ? NaN : Number(lng);
  const hasPin = isPin(la, ln);
  const pin = hasPin ? { lat: la, lng: ln } : null;
  const route = saved && hasPin && Math.abs(Number(saved.venue_lat) - la) < 1e-5 && Math.abs(Number(saved.venue_lng) - ln) < 1e-5 ? routeSummary({ ...saved, off_campus: true }) : null;

  const run = async (kind, args) => {
    setBusy(kind); setErr(""); setPlaces(null);
    const r = await locateVenue(args);
    setBusy(null);
    if (r.error) return setErr(r.error);
    if (!r.places.length) return setErr(kind === "link" ? "That link has no map position in it. Open the place in Google Maps and copy the link from the address bar, or search by name above." : "Nothing found. Try the college's full name and its area (for example “CMR Institute of Technology, Kundalahalli, Bengaluru”), or paste a Google Maps link.");
    setPlaces(r.places);
    if (kind === "link" && r.places.length === 1) { onPick(r.places[0]); setPlaces(null); setLink(""); }
  };

  return (
    <div className="hk-pick">
      {hasPin && (
        <div className="hk-pin">
          <div className="hk-pin-head">
            <b><MapPin size={16} /> Map pin set{flagged && <span className="chk" title="Found automatically from the venue's name"> Check the position</span>}</b>
            <span className="inline-msg">{formatKm(straightKm(CAMPUS, pin))} from {CAMPUS.short} in a straight line · {la.toFixed(5)}, {ln.toFixed(5)}</span>
          </div>
          {route?.text && <p className="inline-msg">Measured when last saved: {route.text}.</p>}
          <iframe className="hk-map" title="Map of the venue" src={osmEmbedUrl(pin)} loading="lazy" referrerPolicy="no-referrer" />
          <div className="notice-actions">
            <a className="btn-s" href={placeUrl(pin)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Check it in Google Maps</a>
            <button type="button" className="btn-s ghost" onClick={onClear}><Trash2 size={14} /> Remove the pin</button>
          </div>
          <small className="inline-msg">The road distance and driving time from {CAMPUS.short} are measured when you save.</small>
        </div>
      )}

      <div className="field">
        <label htmlFor="hk-find">{hasPin ? "Search again" : "Find the venue on the map"}</label>
        <div className="hk-find">
          <input id="hk-find" type="text" value={query} placeholder="College or place, with its area" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run("search", { query }); } }} />
          <button type="button" className="btn-s" disabled={Boolean(busy) || query.trim().length < 3} onClick={() => run("search", { query })}>{busy === "search" ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />} Find on map</button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="hk-paste">Or paste a Google Maps link</label>
        <div className="hk-find">
          <input id="hk-paste" type="text" value={link} placeholder="https://maps.app.goo.gl/… or https://www.google.com/maps/…" onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run("link", { link }); } }} />
          <button type="button" className="btn-s" disabled={Boolean(busy) || link.trim().length < 8} onClick={() => run("link", { link })}>{busy === "link" ? <LoaderCircle size={14} className="spin" /> : <MapPin size={14} />} Use link</button>
        </div>
      </div>

      {err && <p className="form-msg err" role="alert">{err}</p>}
      {places && places.length > 0 && (
        <ul className="hk-places" aria-label="Places found">
          {places.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <div><b>{p.name}</b><small>{formatKm(p.km)} from {CAMPUS.short} in a straight line</small></div>
              <button type="button" className="btn-s" onClick={() => { onPick(p); setPlaces(null); }}>Use this place</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
