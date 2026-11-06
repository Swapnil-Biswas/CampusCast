import { ShieldCheck } from "lucide-react";
import { trust } from "../lib/data";

export default function Trust() {
  return (
    <section className="section trust" id="trust">
      <div className="container trust-wrap">
        <div data-reveal>
          <p className="eyebrow">Trust and safety</p>
          <h2 className="display">A community you can <em className="accent">actually</em> trust.</h2>
          <p className="lede">Connect, notes, CampusXchange and mentorship only work if everyone is real. Every account is tied to a verified college email.</p>
        </div>
        <div className="trust-list" data-stagger>
          {trust.map((t) => (<span key={t}><ShieldCheck />{t}</span>))}
        </div>
      </div>
    </section>
  );
}
