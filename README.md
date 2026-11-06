# CampusCast

**Smart campus announcements: one feed, filtered for you.**

Students miss important updates because information is scattered across WhatsApp groups, notice boards and email. CampusCast is a single platform that filters every announcement by **department, year, club and urgency**, and bundles the student-life tools that usually live in separate chats.

This repository contains the CampusCast landing page.

## What the page covers

- **The problem and the idea:** why notices get lost, and how "publish once, reach the right students" works
- **Live filter demo:** pick a department, year and clubs and watch the notices that are not yours fade out
- **Urgency system:** P0 (critical) to P3 (FYI), and how loudly each one notifies
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
- **Trust and safety, roadmap and six-month targets**, plus an early-access signup form

## Design

A campus notice-board look: crumpled beige paper background, sticky-note cards with tape and pins, handwritten note titles and highlighter-style emphasis. The only animation is a soft fade-in as sections scroll into view.

Fonts: Fraunces (headings), Schibsted Grotesk (body) and Caveat (handwriting), loaded with `next/font`.

## Tech stack

- Next.js (App Router) and React
- GSAP with ScrollTrigger for the scroll fade-in
- lucide-react for icons
- Plain CSS, no UI framework

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

## Adding your video

The hero shows a video placeholder. To use your own video:

1. Put the file in `public/`, for example `public/campus-video.mp4`.
2. In `components/Hero.js`, set `VIDEO_SRC = "/campus-video.mp4"` (and optionally `VIDEO_POSTER`).

## Project structure

```
app/            layout, global styles, page
components/     one file per page section
lib/data.js     all page copy and demo data
public/         paper texture and static assets
```

## Notes

- The early-access form is front-end only and does not store emails yet.
- The notices in the filter demo are sample data.
