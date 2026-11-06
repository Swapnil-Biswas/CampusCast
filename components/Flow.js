import { flow } from "../lib/data";

export default function Flow() {
  return (
    <section className="section" id="how" style={{ paddingTop: 20 }}>
      <div className="container">
        <div className="sec-head" data-reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="display">Publish once. Reach the <em className="accent">right</em> students.</h2>
        </div>
        <div className="flow rot pins colors">
          {flow.map((f) => (
            <div className="flow-step" data-reveal key={f.n}>
              <span className="n">{f.n}</span>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
