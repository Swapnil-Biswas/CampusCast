import { chaos } from "../lib/data";

export default function Problem() {
  return (
    <section className="section" id="problem">
      <div className="container">
        <div className="sec-head" data-reveal>
          <p className="eyebrow">The problem</p>
          <h2 className="display">Important updates get <em className="accent">lost</em> in the noise.</h2>
          <p className="lede">Campus information lives in a dozen places and none of them tell you what matters. So students miss the one thing they needed.</p>
        </div>
        <div className="chaos-grid rot pins colors" data-stagger>
          {chaos.map((c, i) => (
            <article className="chaos-card" key={c.k}>
              <span className="num">0{i + 1}</span>
              <h3>{c.k}</h3>
              <p>{c.d}</p>
            </article>
          ))}
        </div>
        <div className="result-row" data-stagger>
          <div><b>Missed <em>deadlines</em></b><span>Forms, fees and registrations slip by.</span></div>
          <div><b>Information <em>overload</em></b><span>Students mute groups and miss what counts.</span></div>
          <div><b>No <em>urgency</em> signal</b><span>An exam change looks like a casual poster.</span></div>
        </div>
      </div>
    </section>
  );
}
