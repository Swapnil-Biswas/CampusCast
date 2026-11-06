import Link from "next/link";

export default function Nav() {
  return (
    <header className="nav" id="nav">
      <div className="container nav-in">
        <Link href="/" className="logo">Campus<i>Cast</i></Link>
        <nav className="nav-links" aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#try">Try the filters</a>
          <a href="#features">Features</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <a href="#join" className="pill-sm">Get early access</a>
      </div>
    </header>
  );
}
