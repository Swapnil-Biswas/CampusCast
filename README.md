# CampusCast

**Smart campus announcements: one feed, filtered for you.**

Students miss important updates because information is scattered across WhatsApp groups, notice boards and email. CampusCast is a single platform that filters every announcement by **department, year, club and urgency**, and bundles the student-life tools that usually live in separate chats.

This repository contains the CampusCast landing page: a scroll-driven 3D classroom followed by the product sections.

## The scroll story

The page opens in a real-time 3D lecture room. The students and professor keep moving on their own, and the camera travels through the room as you scroll:

1. **Class is in session:** a lecture is under way.
2. **Everyone listens:** the camera moves down the aisle.
3. **The notice gets buried:** dozens of notices swirl around the pinboard and students check their phones.
4. **One feed:** the notices stream into the board, which becomes the CampusCast feed.
5. **The right students:** phones light up and only the students a notice is for raise a hand.

## What else the page covers

- **Campus in motion:** a video that grows to fill the screen
- **Nine sections**
  - Hackathon
  - Department Notifications
  - Examinations
  - Workshops
  - Cultural Events
  - Connect (find teammates for a hackathon)
  - Notes & Previous Papers
  - CampusXchange (seniors sell old stuff to juniors)
  - Free Mentorship
- **How it works:** publish once, reach the right students
- **Live filter demo:** pick a department, year and clubs and see which notices are yours
- **Urgency system:** Now, Today, Soon and FYI, and how loudly each one notifies
- **The engine, trust and safety**, plus an early-access signup form

## Quality levels

The 3D scene adapts to the device, and steps down further if the frame rate drops.

| Level | Used on | What you get |
|---|---|---|
| High | Dedicated GPUs | Full models, scanned room, 4K shadows, ambient occlusion |
| Medium | Other desktops and laptops | Full models, scanned room, 2K shadows |
| Low | Phones and low-end devices | Lighter models and room, no real-time shadows |
| Plain | No WebGL2, reduced motion, data saver, 2G, very low memory | Text-only story, no 3D |

Add `?q=high`, `?q=mid` or `?q=low` to the URL to force a 3D level while testing.

On laptops with two GPUs, the browser must be set to use the dedicated one in the operating system's graphics settings.

## Tech stack

- Next.js (App Router) and React
- three.js with React Three Fiber for the classroom
- GSAP with ScrollTrigger and ScrollToPlugin for scroll animation and smooth scrolling
- lucide-react for icons
- Plain CSS, no UI framework

Fonts: Bricolage Grotesque, Instrument Sans and DM Mono, loaded with `next/font`.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Production build:

```bash
npm run build
npm start
```

## Project structure

```
app/                     layout, global styles, page
components/story/        the 3D classroom, scroll chapters and camera
components/sections/     the page sections after the story
lib/data.js              page copy and demo data
lib/chapters.js          scroll ranges of the story chapters
public/people/           character models and animations (public/people/lo/ for low-end devices)
public/textures/         room materials
public/campus-video.mp4  campus video
```

## Credits

- Characters and animations: [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), MIT licence (see `public/people/LICENSE-Rocketbox.txt`)
- Room materials: [Poly Haven](https://polyhaven.com), CC0 (see `public/textures/LICENSE-PolyHaven.txt`)

Full details for all third-party work, including fonts and libraries, are in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Notes

- The early-access form is front-end only and does not store emails yet.
- The notices in the filter demo are sample data.
