import { roadmap } from "../lib/data";

export default function Roadmap() {
  return (
    <section className="section" id="roadmap">
      <div className="container">
        <div className="sec-head" data-reveal>
          <p className="eyebrow">Roadmap</p>
          <h2 className="display">Ship the <em className="accent">painkiller</em> first.</h2>
          <p className="lede">The MVP fixes missed notices. The community layer arrives once the feed has people in it.</p>
        </div>
        <div className="road rot pins" data-stagger>
          {roadmap.map((r) => (
            <article className="road-card" key={r.t} style={{ "--n": r.c }}>
              <span className="wk">{r.w}</span>
              <h3>{r.t}</h3>
              <p className="d">{r.d}</p>
              <ul>{r.b.map((b) => <li key={b}>{b}</li>)}</ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
