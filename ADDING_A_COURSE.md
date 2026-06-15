# Adding a new course to the portal

This app is a **multi-course portal**. The home page (`/`) is a picker; each
course is its own route. All courses share **one PIN** and **one Anthropic
proxy**. Follow this pattern to add a course (e.g. Spanish, History).

## The shared infrastructure (do NOT duplicate these)

- **Auth** — `components/AuthGate.jsx` wraps every page. It shows the shared
  PIN keypad (`components/Login.jsx`) until a valid token is in `localStorage`,
  then renders the course. There is exactly one login for the whole portal.
  Never add a second login or a per-course PIN.
- **AI tutor** — `/api/tutor` is a PIN-gated proxy to Anthropic. It takes
  `{ system, messages }` and returns `{ text }`. Build your course-specific
  system prompt **on the client** and call it with `authFetch` (from
  `lib/clientAuth`) so the bearer token is attached. The Anthropic key lives
  only on the server, in one place.
- **Progress** — `/api/progress` persists completed weeks in one shared table
  keyed by `(user_id, week_number)`. To keep courses from colliding, each
  course offsets its week numbers into its own band:

  | Course      | Route        | Week band    |
  |-------------|--------------|--------------|
  | IR Tutor    | `/irtutor`   | `0 – 14`     |
  | Write 1001  | `/write1001` | `1001 – 1014`|
  | Roots       | `/roots`     | `2001 – 2014`|

  Pick the **next free band** (e.g. `3000` for a 4th course). Store with
  `week: localWeek + OFFSET`; read back by filtering to your band and
  subtracting the offset. (This avoids a DB migration. If you ever want true
  per-course rows, add a `course text` column to `progress`/`chat_messages`
  and key on `(user_id, course, week_number)`.)

## Steps to add a course

1. **Create the route folder** `app/<course>/`:
   - `app/<course>/data/curriculum.js` — export `COURSE` (code/title/subtitle)
     and `WEEKS` (array of `{ week, unit, title, objective, ... }`). Plain JS,
     no TypeScript (this app has no tsconfig).
   - `app/<course>/components/` — your widgets. Reuse the shape of the existing
     `Drill` / `WritingBox` / `Tutor` (Write 1001) or `RootDrill` / `Tutor`
     (Roots). Tutors and any AI feedback must call `/api/tutor` via `authFetch`.
   - `app/<course>/page.jsx` — wrap everything in `<AuthGate>`, render a
     `.cwrap` shell (sidebar + content), wire progress to `/api/progress` with
     your week offset, and include a `<a href="/" className="backlink">All
     courses</a>` link.

2. **Add a card to the picker** in `app/page.js`: push an entry into the
   `COURSES` array (`href`, `code`, `title`, `sub`, `meta`, `Icon`, `tone`).

3. **Style it** with the shared `.cwrap` classes in `app/globals.css`. They are
   fully scoped — they never touch the IR Tutor (`.ir-*`) theme. For a distinct
   accent, add `.cwrap.<tone>{ --accent:#...; --accent-soft:#...; }` and a
   `.cp-card.<tone>` rule for the picker card. Use the existing `.cwrap` block
   verbatim; only override the accent vars.

4. **Build & deploy** (see below). No env vars or DB changes are needed —
   the course inherits the existing PIN, Anthropic key, and progress table.

## Deploy

This Vercel project (`ir-tutor`, personal/Keystone account) is **not
git-linked**, so pushing GitHub does not auto-deploy. From this folder:

```powershell
# VERCEL_TOKEN (and all Keystone personal-account secrets) live in the master file:
#   C:\Users\david\Documents\Keystone Summit\keystone_credentials_MASTER.txt  -> [vercel] VERCEL_TOKEN
# (old pointer C:\Users\david\Config keystone summit.txt is now *.legacy.txt — superseded by the master)
git add -A; git commit -m "feat: <course>"
git push keystone HEAD:main          # source control -> keystone-summit/ir-tutor
vercel --prod --yes --token <KEYSTONE_VERCEL_TOKEN>   # actual deploy
```

Then confirm `https://ir-tutor.vercel.app/<course>` returns 200 and the PIN
gate appears.
