import { engine, people } from "../lib/data";

export default function Engine() {
  return (
    <section className="section" style={{ paddingTop: 0 }} id="engine">
      <div className="container">
        <div className="sec-head" data-reveal>
          <p className="eyebrow">Under the hood</p>
          <h2 className="display">One smart engine <em className="accent">behind</em> every section.</h2>
        </div>
        <div className="engine" data-stagger>
          {engine.map((e) => (<div key={e.t}><b>{e.t}</b><span>{e.d}</span></div>))}
        </div>
        <div className="people rot pins colors" data-stagger>
          {people.map((p) => (<div className="person" key={p.t}><h4>{p.t}</h4><p>{p.d}</p></div>))}
        </div>
      </div>
    </section>
  );
}
