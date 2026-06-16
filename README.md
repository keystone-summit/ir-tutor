# IR Tutor — deploy-ready app

An online "university dashboard" for an Introduction to International Relations course
(classical realism + game theory + analysis), with a Socratic AI tutor. It runs live on
**Vercel**, stores logins / progress / chat history in **Supabase**, and calls Claude
through a **secure backend** so your API key is never exposed.

You do not need to be a programmer to deploy this. Follow the steps in order.

---

## What each piece does
- **Vercel** = the live website (gives you a public web address).
- **Supabase** = the memory (student accounts + which weeks they finished + every tutor chat).
- **/app/api/tutor** = a small backend that talks to Claude using your secret key, kept on the server.

---

## Step 1 — Put the code on GitHub
1. Create a free account at https://github.com and click **New repository**. Name it `ir-tutor-app`, keep it Private, **Create**.
2. Easiest upload: on the new repo page click **uploading an existing file**, then drag in
   **all the files in this folder** (including the `app`, `components`, and `lib` folders). Commit.

## Step 2 — Create the Supabase project (the database)
1. Sign up at https://supabase.com → **New project**. Pick any name and a password; wait ~2 min for it to finish.
2. Left sidebar → **SQL Editor** → **New query**. Open `supabase_schema.sql` from this folder, copy all of it, paste, and click **Run**. (This creates the tables and the privacy rules.)
3. Left sidebar → **Project Settings → API**. Copy two values for later:
   - **Project URL**
   - **anon public** key
4. (Simplest sign-in) Left sidebar → **Authentication → Providers/Settings** and turn **off**
   "Confirm email". Then students can sign up and log in instantly. (Leave it on if you want email verification.)

## Step 3 — Get your Anthropic API key (powers the tutor)
1. Go to https://console.anthropic.com → **API Keys** → **Create key**. Copy it (starts with `sk-ant-`).
2. Add a little credit under **Billing** so the tutor can respond.

## Step 4 — Deploy on Vercel (makes it live)
1. Sign up at https://vercel.com with your GitHub account → **Add New → Project** → import `ir-tutor-app`.
2. Before clicking Deploy, open **Environment Variables** and add these three
   (names must match exactly):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase **Project URL** |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase **anon public** key |
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` key |

3. Click **Deploy**. After ~1 minute you get a live link. The canonical production URL for this app is `https://ir-tutor.vercel.app`.
4. Open it, create an account, and try the tutor. Progress and chats now save automatically.

---

## Run it on your own computer first (optional)
1. Install Node.js (https://nodejs.org).
2. In this folder: copy `.env.example` to `.env.local` and fill in the three values.
3. `npm install` then `npm run dev`, and open http://localhost:3000.

## Changing things later
- **Course content:** edit `components/course.js` (weeks, readings, games). No other file needs touching.
- **Tutor's personality / rules:** edit the `buildSystem` text in `components/Dashboard.jsx`.
- **Which Claude model:** set `TUTOR_MODEL` in Vercel (default `claude-sonnet-4-6`).

## A note on cost & safety
- The Anthropic key lives only on the server (`/app/api/tutor`); browsers never see it.
- Supabase Row-Level Security means each student can only ever read their own data.
- Each tutor reply costs a small amount of Anthropic credit — watch usage in the Anthropic console.
