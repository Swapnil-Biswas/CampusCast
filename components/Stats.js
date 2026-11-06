import { stats } from "../lib/data";

export default function Stats() {
  return (
    <section className="section" style={{ paddingTop: 0 }} id="targets">
      <div className="container">
        <div className="sec-head" data-reveal>
          <p className="eyebrow">Six-month targets</p>
          <h2 className="display">How we will know it is <em className="accent">working</em>.</h2>
        </div>
        <div className="stats" data-stagger>
          {stats.map((s) => (
            <div className="stat" key={s.l}>
              <b data-count={s.n} data-pre={s.pre} data-suf={s.suf}>{s.pre}{s.n}{s.suf}</b>
              <span>{s.l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
