"use client";
import { ArrowRight } from "lucide-react";
import { marqueeWords } from "../../lib/data";

// Closing section: huge headline, the pilot sign-up, a scrolling band of all nine sections, and the footer.
export default function Join() {
  const band = [...marqueeWords, ...marqueeWords];
  return (
    <>
      <section className="join" id="join">
        <div className="wrap">
          <p className="eyebrow light">Early access</p>
          <h2 className="join-h" data-rv><span className="rvl"><span>Issue no. 1 starts</span></span><span className="rvl"><span>when your campus <em>joins.</em></span></span></h2>
          <p className="lede light">Be part of the pilot. Bring your department, your club, and your group chats.</p>
          {/* Plain GET form: carries the college email over to the sign-up page. */}
          <form className="join-form" action="/signup">
            <input type="email" name="email" required placeholder="25ug1byai282@bmsit.in" aria-label="College email" />
            <button className="btn btn-clay" type="submit" data-magnetic>Join the pilot <ArrowRight size={18} /></button>
          </form>
          <small className="fine">College emails only. No likes. No feed noise.</small>
        </div>
        <div className="band" aria-hidden="true"><div data-marquee="left">{band.map((w, i) => <span key={i}>{w}<i>✦</i></span>)}</div></div>
      </section>
      <footer className="foot">
        <div className="wrap foot-in">
          <b className="foot-logo">Campus<i>Cast</i></b>
          <p>Smart campus announcements. Filtered by department, year, club and urgency.</p>
          <nav><a href="#modules">Features</a><a href="#how">How it works</a><a href="#try">Try the filters</a><a href="#urgency">Urgency</a></nav>
        </div>
        <p className="foot-fine">© CampusCast · Made for students, by students.</p>
      </footer>
    </>
  );
}
