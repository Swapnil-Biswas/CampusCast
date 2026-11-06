import * as Icons from "lucide-react";
import { features } from "../lib/data";

const tint = { Official: "var(--y)", Events: "var(--pk)", Community: "var(--gn)" };

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="sec-head" data-reveal>
          <p className="eyebrow">Nine sections, one platform</p>
          <h2 className="display">Everything campus life runs on, in <em className="accent">one</em> place.</h2>
          <p className="lede">Official channels, events and community tools all share the same announcement and targeting engine.</p>
        </div>
        <div className="f-grid rot pins" data-stagger>
          {features.map((f) => {
            const Ic = Icons[f.icon];
            return (
              <article className="f-card" key={f.n} style={{ "--n": tint[f.g] }}>
                <div className="f-top"><span className="f-ic"><Ic /></span><span className="f-n">{f.n}</span></div>
                <div className="f-g"><span>{f.g}</span></div>
                <h3>{f.t}</h3>
                <p className="h">{f.h}</p>
                <ul>{f.b.map((b) => <li key={b}>{b}</li>)}</ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
