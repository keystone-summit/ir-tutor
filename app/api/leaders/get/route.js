// GET /api/leaders/get?slug=india -> single country's full object
// slug = lowercase country name, hyphenated (e.g. "united-states")
export const runtime = "nodejs";

import { findBySlug } from "../../../../lib/leaders";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSlug = searchParams.get("slug");
    if (!rawSlug) {
      return Response.json(
        { ok: false, error: "slug query param required." },
        { status: 400 }
      );
    }
    // HOTFIX 2 (API side): case-normalize the incoming slug so callers can
    // hit /api/leaders/get?slug=UNITED-STATES and still get a 200. We do
    // NOT redirect the API — pure JSON responders should stay silent on
    // canonicalization and simply match.
    const slug = String(rawSlug).toLowerCase();
    const row = findBySlug(slug);
    if (!row) {
      return Response.json(
        { ok: false, error: `No country matching slug '${slug}'.` },
        { status: 404 }
      );
    }
    return new Response(
      JSON.stringify({ ok: true, leader: row }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      }
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: "Failed to load leader." },
      { status: 500 }
    );
  }
}
