import { ArrowRight, Play } from "lucide-react";

// Drop your video into /public and put its path here, e.g. "/campus-video.mp4".
// While this is empty, a placeholder frame is shown instead.
const VIDEO_SRC = "";
const VIDEO_POSTER = ""; // optional, e.g. "/campus-video-poster.jpg"

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero-grid">
        <div data-reveal>
          <p className="eyebrow">Issue no. 1 · For every campus</p>
          <h1 className="display">
            Never miss<br />what<br /><em>matters</em><br />on campus.
          </h1>
          <p className="sub">
            CampusCast is one feed for every notice, exam change, hackathon and workshop,
            filtered by your department, year, club and how urgent it really is.
          </p>
          <div className="hero-cta">
            <a href="#join" className="btn btn-primary">Join with your college email <ArrowRight size={17} /></a>
            <a href="#try" className="btn btn-ghost">Try the filters</a>
          </div>
          <p className="fine">College emails only. One feed. No group-chat noise.</p>
        </div>

        <div className="video-wrap" data-reveal>
          {VIDEO_SRC ? (
            <video src={VIDEO_SRC} poster={VIDEO_POSTER || undefined} controls playsInline preload="metadata" />
          ) : (
            <div className="video-ph" role="img" aria-label="Video placeholder">
              <div>
                <div className="play"><Play size={34} fill="currentColor" /></div>
                <b>Your campus video goes here</b>
                <small>16:10 frame · set VIDEO_SRC in components/Hero.js</small>
              </div>
            </div>
          )}
          <span className="video-cap">CampusCast in 60 seconds</span>
          <div className="mini m1"><small>P0 · NOW</small>DBMS internal moved to Tue!</div>
          <div className="mini m2"><small>P1 · TODAY</small>Hackathon closes tonight</div>
        </div>
      </div>
    </section>
  );
}
