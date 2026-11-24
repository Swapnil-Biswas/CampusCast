// Shown the instant a dashboard link is tapped, while the next page loads.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "grid", gap: 14, maxWidth: 760 }}>
      <div className="skel" style={{ height: 34, width: "55%" }} />
      <div className="skel" style={{ height: 16, width: "35%" }} />
      {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 96 }} />)}
    </div>
  );
}
