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

## Sign-up and sign-in (Supabase)

Accounts are handled by [Supabase Auth](https://supabase.com/docs/guides/auth). Until keys are added, the site still runs and the sign-in pages say they are not set up yet.

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in the Project URL and the anon (or publishable) key from **Project Settings > API**.
3. In **Authentication > URL Configuration**, set the Site URL to your site, and add `http://localhost:3000/auth/callback` (plus your production `/auth/callback` URL) to the Redirect URLs.
4. In **SQL Editor**, paste and run [`supabase/setup.sql`](supabase/setup.sql). It adds the college-email rule, the `profiles` table and the private `id-cards` storage bucket.
5. Restart `npm run dev`.

### Forgot password

"Forgot password?" on the sign-in page goes to `/forgot-password`. Students enter their college email, Supabase emails them a one-time code, and they type the code and their new password on the same page. This works on any device.

**One-time setup:** in Supabase open **Authentication > Emails > Templates > Reset Password**, set the subject to "Your CampusCast password reset code" and paste [`supabase/email-templates/reset-password.html`](supabase/email-templates/reset-password.html) as the message body. It shows the code (`{{ .Token }}`). The emailed link also still works if opened in the same browser; it goes through `/auth/callback` to `/reset-password`.

### College emails and student verification

- Sign-up only accepts college emails: `@bmsit.in`, plus domains ending in `.edu`, `.edu.<country>` or `.ac.<country>` (e.g. `iitb.ac.in`).
- BMSIT student emails are read automatically. `25ug1byai282@bmsit.in` means batch 2025, undergraduate, college code 1BY, branch `ai` (AI & Machine Learning), roll 282, so USN `1BY25AI282`. The branch is filled in and locked, the year of study is worked out from the batch (it can still be changed, e.g. for lateral entry), and batch and USN are saved on the profile. Branch codes live in `lib/college.js` (`cs` Computer Science & Engineering, `cv` Civil, `ai` AI & ML, plus the other VTU codes). For a college that uses another domain, add it in the SQL Editor: `insert into public.allowed_college_domains (domain) values ('mycollege.in');`. The rule is enforced inside Supabase, so it can't be bypassed by calling the API directly.
- After confirming their email, students land on `/verify` and enter full name, branch and year, and upload a photo of the front of their student ID card.
- To review: open **Table Editor > profiles**, filter `status = pending`, view the card in **Storage > id-cards > (user id)**, then set `status` to `verified`, or to `rejected` with a `review_note` the student will see.

Pages: `/signup` and `/signin`. By default Supabase emails a confirmation link before the first sign-in; turn off **Confirm email** under **Authentication > Providers > Email** to sign users in straight after sign-up.


## Login files

```
app/auth/, app/signin/, app/signup/, app/forgot-password/, app/reset-password/, app/verify/   sign-up, sign-in, reset and verification pages
components/auth/, components/verify/, components/AuthNav.js, components/SiteNav.js            their forms and the nav sign-in area
lib/college.js, lib/profile.js, lib/supabase/                                              college email rules, profiles, Supabase clients
proxy.js                                                                                    refreshes the Supabase session
supabase/setup.sql                                                                          database setup (run once in Supabase)
```
