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
- Supabase (Auth, Postgres and private Storage) for sign-up, sign-in and student verification
- lucide-react for icons
- Plain CSS, no UI framework

Fonts: Bricolage Grotesque, Instrument Sans and DM Mono, loaded with `next/font`.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The site runs without any keys; sign-in only works after the Supabase setup [below](#sign-up-and-sign-in-supabase).

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
app/auth/, app/signin/, app/signup/, app/forgot-password/, app/reset-password/, app/verify/
                         sign-up, sign-in, password reset and ID verification pages
components/auth/, components/verify/, components/AuthNav.js, components/SiteNav.js
                         their forms and the sign-in area of the nav
lib/college.js, lib/profile.js, lib/supabase/
                         college email rules, profiles and the Supabase clients
proxy.js                 refreshes the Supabase session cookie
supabase/setup.sql       database setup, run once in the Supabase SQL Editor
public/people/           character models and animations (public/people/lo/ for low-end devices)
public/textures/         room materials
public/campus-video.mp4  campus video
```

## Credits

- Characters and animations: [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), MIT licence (see `public/people/LICENSE-Rocketbox.txt`)
- Room materials: [Poly Haven](https://polyhaven.com), CC0 (see `public/textures/LICENSE-PolyHaven.txt`)

Full details for all third-party work, including fonts and libraries, are in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Notes

- The early-access form on the home page sends the email on to the sign-up page; nothing is stored until the student creates an account.
- With Supabase connected, the home page is rendered on request (it reads the signed-in user for the nav) instead of being a static file.
- Student ID card photos are sensitive personal data. They are kept in a private bucket and are only visible to the student who uploaded them and to project admins in the Supabase dashboard.
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
- BMSIT student emails are read automatically. A format like `25ug1bycs001@bmsit.in` means batch 2025, undergraduate, college code 1BY, branch `cs` (Computer Science & Engineering), roll 001, so USN `1BY25CS001`. The branch is filled in and locked, the year of study is worked out from the batch (it can still be changed, e.g. for lateral entry), and batch and USN are saved on the profile. Branch codes live in `lib/college.js` (`cs` Computer Science & Engineering, `cv` Civil, `ai` AI & ML, plus the other VTU codes). For a college that uses another domain, add it in the SQL Editor: `insert into public.allowed_college_domains (domain) values ('mycollege.in');`. The rule is enforced inside Supabase, so it can't be bypassed by calling the API directly.
- After confirming their email, students land on `/verify` and enter full name, branch and year, and upload a photo of the front of their student ID card.
- To review: open **Table Editor > profiles**, filter `status = pending`, view the card in **Storage > id-cards > (user id)**, then set `status` to `verified`, or to `rejected` with a `review_note` the student will see.

Pages: `/signup` and `/signin`. By default Supabase emails a confirmation link before the first sign-in; turn off **Confirm email** under **Authentication > Providers > Email** to sign users in straight after sign-up.



## The dashboard

Signed-in, ID-verified students land on `/dashboard`. Everything is stored in Supabase and protected by row-level security, so a student can only see what their department, year and clubs entitle them to.

| Area | What works |
| --- | --- |
| Home feed, Saved, Calendar | Notices ranked Now > Today > Soon > FYI, filters, search, read receipts, acknowledgement of Now notices, bookmarks, reminders, `.ics` download |
| Official | Department circulars, exams (any change is re-announced as Now), workshops with seat cap, waitlist and CSV export, hackathons, cultural events and clubs |
| Community | Connect (teammates), notes and previous papers (moderated, duplicate check), CampusXchange with live chat, free mentorship with sessions and ratings, reports and blocks |
| Admin | Publish notices (scheduled, expiring, audience preview), reach analytics, ID verification, moderation, people and roles, clubs, audit log |
| Alerts | Live in-app bell, email for Now/Today notices and reminders, browser push, daily 7 am digest, quiet hours |

### Setting it up on a new Supabase project

Run the files in `supabase/` in order with `node scripts/db.mjs -f <file>` (the database password comes from the `PGPASSWORD` environment variable and is never stored): `setup.sql`, `dashboard-1-engine.sql` to `dashboard-4-community.sql`, then `PGPASSWORD=... node scripts/setup-alerts.mjs`, which applies `dashboard-5-alerts.sql`, stores the job secret and schedules the cron jobs (publish scheduled notices, send reminders, build digests, expire listings, call the dispatcher). `supabase/seed.sql` adds clearly labelled demo rows.

Environment variables are listed in `.env.example`. `JOB_SECRET` must be identical in `.env.local`/Vercel and in the database (the setup script copies it). Email and push need `SMTP_*` and `VAPID_*` set; without them those alerts are skipped and the in-app bell still works.

### Tests

`node supabase/tests/stage1.mjs` (and `stage3`, `stage4`, `stage5`) run security checks inside a rolled-back transaction, impersonating different students. They never leave data behind.

## Examination notices (AI-assisted, approval first)

Official exam PDFs go from a department admin to students through a fixed, auditable path. Nothing reaches students until a central admin approves **and** publishes it. The AI only fills in a draft.

```
upload PDF -> AI reads it -> draft (review + edit) -> submit -> central admin: approve / request changes / reject -> publish -> students notified
```

| Who | Where | What they can do |
|---|---|---|
| Information staff (admin with **Uploads for** departments) | Dashboard > Admin > **Exam notices** | Upload a PDF, check the AI's draft against the PDF, edit details and timetable, save, submit. Only for their own departments. |
| Head of department / cluster head (admin with **Approves for** departments) | Dashboard > Admin > **Exam approvals** | Approve, request changes or reject (reason required), publish, archive. A cluster head covers several departments; a notice for several departments needs an approver who covers all of them. Told by notification (and email) when a notice is waiting. |
| Central admin (`super_admin`) | People & roles > **Exam notice access** | Everything, for every department. Chooses who uploads and who approves for which departments. |
| Student | Dashboard > **Examinations** | IA 1, IA 2, IA 3, Final Examination and Special tabs, only for their department and semester, with a live countdown, the original PDF (while it is kept), and automatic reminders. |

**Separation of duties:** the person who submitted a notice cannot approve or publish it. A central admin can (so a small college can run with one), and the approval history records that they did.

**Reminders (automatic):** every verified student of a published timetable is reminded **1 day** and **2 hours** before each exam, in the app and by email / push according to their alert settings (the email goes to the address on their CampusCast account). Nothing to click: it runs every minute from the database (`due_exam_reminders`).

**PDF retention:** about **20 days** after a notice's last exam (`EXAM_PDF_RETENTION_DAYS`) its original PDF is deleted from storage; the notice and timetable stay and students see that the file was removed. The cleanup runs when a head or central admin opens Exam approvals.

Categories are exactly **IA 1, IA 2, IA 3, Final Examination** (plus Special Examination for supplementary, practical, laboratory and revaluation notices). The wording used in the PDF (for example "CIE 2") is kept alongside. An unclear category stays empty ("Requires admin review") and blocks submitting until a person chooses one.

**Setup**
1. Run `supabase/dashboard-6-exams.sql`, then `supabase/dashboard-7-exam-alerts.sql`, in the Supabase SQL Editor (after setup.sql and dashboard-1 to 5). Both are safe to re-run. dashboard-7 schedules the reminder job when `pg_cron` is on (dashboard-5 enables it).
2. Add AI keys to `.env.local` and to the Vercel project's environment variables (server-only, never `NEXT_PUBLIC_`). Providers are tried in this order, skipping any without a key, and the next one is used automatically when one is rate limited, down or cannot read the file: `ANTHROPIC_API_KEY` (Claude, paid) -> `GEMINI_API_KEY` (Google Gemini, free tier, reads typed and scanned PDFs) -> `GROQ_API_KEY` (Groq, free tier, typed PDFs only: it reads the PDF's text layer, so a scanned PDF is left to Gemini). `EXAM_AI_PROVIDER` forces one provider; `EXAM_AI_MODEL` pins the first provider's model, `GEMINI_MODEL` and `GROQ_MODEL` pin those two. Defaults: `claude-sonnet-5-5`, `gemini-flash-latest`, `llama-3.3-70b-versatile`. With no key the upload still works and the admin fills the draft in by hand.
   `OPENROUTER_API_KEY` (openrouter.ai, free model `google/gemma-4-31b-it:free`, falling back to other free models when it is busy, typed PDFs only) is also supported; it is tried after Gemini and before Groq.
3. A central admin makes each staff member an Admin (People & roles), then ticks their departments under **Exam notice access**: **Uploads for** (information staff) and **Approves for** (head of department / cluster head). Or in SQL: `select public.set_admin_depts('<user id>', array['AI & Machine Learning']);` and `select public.set_approver_depts('<user id>', array['AI & Machine Learning']);`. An admin with no departments cannot upload or approve.
4. Optional: set a student's semester by hand (`profiles.semester`); otherwise it is worked out from their batch (Aug to Jan odd semester, Feb to Jul even).

**PDFs and photos:** a notice can be uploaded as a PDF or as a **JPG, PNG or WebP photo** (for example a circular shared as a picture in a WhatsApp group). Photos are read by Gemini (or Claude); Groq only reads PDFs with text, so it steps aside for photos. HEIC photos are not supported: share or save them as JPG. The file type is judged from the file's own first bytes, never its name.

**How the AI step stays safe**
- The browser uploads to the private `exam-pdfs` bucket; the server re-checks the file (real PDF, not password-protected, not cut off, 20 MB maximum) and `/api/exams/extract` sends it to Claude in the background. The PDF is sent as a document, so typed and scanned pages are both read.
- The model must answer through a fixed structure that records, for every detail, whether the PDF states it, whether it was inferred, or whether it is missing, with page numbers and a short quote.
- The server re-checks everything (`lib/exams/normalize.js`): real dates and times, departments from the configured list, category cross-checked against the PDF's own wording. Special exams are never classed as Final Examination.
- The PDF is untrusted data. The AI can only record data; it has no way to submit, approve or publish. Status changes happen only through `exam_notice_transition()` in the database, which checks role, current status and reason, and writes the approval history and audit log.
- Students are notified only when a notice is published.

**Tests**
- `npm run test:exams`: 156 checks (PDF checks, answer checking, AI request, filling the draft, a whole extraction run, save and decision rules, student views). No network or API key needed.
- `supabase/tests/stage6.mjs`: 119 checks of database access rules, the workflow and re-run safety (needs `PGPASSWORD`, like the other stage tests).
- `supabase/tests/stage7.mjs`: 90 checks of the approver hierarchy, self-approval blocking, notifications to approvers, reminders (windows, duplicates, department and semester matching) and PDF retention.

**Try it for real (checklist)**
1. As a department admin, upload a real text PDF and a scanned PDF; check both drafts against the files.
2. Upload an IA timetable and a final timetable; confirm the categories. Upload a supplementary notice; confirm it is Special, not Final.
3. Submit; as a central admin request changes with a reason; as the department admin fix and submit again; approve; publish.
4. As a student of that department and semester, open Examinations: see the notice, view and download the PDF, and find the notification. As a student of another department, confirm you see nothing.

**Known limits**
- A photo can only be as good as the picture: blurry, cropped or very dark photos give uncertain results, flagged "Check". "Special Examination" is only set when the notice's own words say supplementary, practical, laboratory or revaluation; the AI's label alone is not enough.
- Free tiers: Groq's free limits are small (a long PDF may be refused), it cannot read scanned PDFs, and the PDF text it sees may flatten tables. Both providers send the notice to a third party, so upload only official public notices. Gemini's free tier: rate limited (a busy answer can be retried), PDFs over about 14 MB are refused, and Google may use free-tier content to improve its products, so upload only official public notices. Accuracy on real BMSIT PDFs has not been measured for either provider.
- Never run against a real Anthropic key, real BMSIT PDFs or a live Supabase when this was written: the logic is tested with fakes and an in-memory Postgres, not end to end.
- A PDF over 100 pages, or a timetable too long for one answer, is refused with a message asking to split it. Reading runs in the background for up to 5 minutes (`maxDuration`); on a shorter hosting limit, long PDFs can fail and be retried.
- Academic year and degree programme are stored and shown but do not restrict who sees a notice; department and semester do.
- Timetable rows without a department or semester apply to everyone the notice is for.
- The older `exams` table is kept only for reading under "Earlier postings"; new exam information goes through the approval path.
- Changing a published notice means archiving it and submitting a new one; there is no edit-after-publish.
