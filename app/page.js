import Nav from "../components/Nav";
import Hero from "../components/Hero";
import Problem from "../components/Problem";
import Flow from "../components/Flow";
import FilterDemo from "../components/FilterDemo";
import Urgency from "../components/Urgency";
import Features from "../components/Features";
import Engine from "../components/Engine";
import Trust from "../components/Trust";
import Roadmap from "../components/Roadmap";
import Stats from "../components/Stats";
import CTA from "../components/CTA";
import Animations from "../components/Animations";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Flow />
        <FilterDemo />
        <Urgency />
        <Features />
        <Engine />
        <Trust />
        <Roadmap />
        <Stats />
        <CTA />
      </main>
      <Animations />
    </>
  );
}
