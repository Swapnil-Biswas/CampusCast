import { urgency } from "../lib/data";

export default function Urgency() {
  return (
    <section className="section" id="urgency">
      <div className="container">
        <div className="sec-head" data-reveal>
          <p className="eyebrow">The urgency system</p>
          <h2 className="display">Urgency decides how <em className="accent">loudly</em> we notify.</h2>
          <p className="lede">Only admins can set P0 and P1, so when your phone buzzes for one, you can trust it.</p>
        </div>
        <div className="u-list rot pins">
          {urgency.map((u, i) => (
            <div className="u-row" key={u.p} data-reveal>
              <div className="u-p" style={{ color: u.c }}>{u.p}</div>
              <div className="u-name">{u.name}<small>{u.ex}</small></div>
              <div className="u-how">{u.how}</div>
              <div className="u-barwrap">
                <div className="u-bar-label">Loudness</div>
                <div className="u-bar"><i style={{ width: `${u.w}%`, background: u.c }} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
