// GET /api/seminar/briefing-audio?id=<n>
//   Streams the pre-generated Weekly Briefing narration MP3 for one edition.
//
//   Public (no PIN) — same posture as the static theory/pattern MP3s under
//   /audio/seminar/. The bytes are stored in public.seminar_briefing_audio by
//   /api/seminar/voice-briefing (weekly cron) because Vercel functions can't
//   write static files at run time. Returns 404 if that edition isn't voiced yet
//   (the reader's SeminarAudio control then quietly hides itself).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { query } from "../../../../lib/db";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id"), 10);
  if (!Number.isInteger(id)) return new Response("missing id", { status: 400 });

  let row;
  try {
    const r = await query(
      `select mp3 from public.seminar_briefing_audio where seminar_id = $1 limit 1`,
      [id]
    );
    row = r.rows[0];
  } catch {
    // Table may not exist yet (pre-migration) — treat as "no audio".
    return new Response("not found", { status: 404 });
  }
  if (!row || !row.mp3) return new Response("not found", { status: 404 });

  const buf = row.mp3; // pg returns bytea as a Node Buffer
  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(buf.length),
      "cache-control": "public, max-age=86400",
      "accept-ranges": "bytes",
    },
  });
}
