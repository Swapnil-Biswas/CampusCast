import Nav from "../components/Nav";
import Story from "../components/story/Story";
import VideoReel from "../components/sections/VideoReel";
import Modules from "../components/sections/Modules";
import How from "../components/sections/How";
import Filters from "../components/sections/Filters";
import Urgency from "../components/sections/Urgency";
import Platform from "../components/sections/Platform";
import Join from "../components/sections/Join";
import Motion from "../components/sections/Motion";
import SmoothScroll from "../components/SmoothScroll";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Story />
        <VideoReel />
        <Modules />
        <How />
        <Filters />
        <Urgency />
        <Platform />
        <Join />
      </main>
      <Motion />
      <SmoothScroll />
    </>
  );
}
