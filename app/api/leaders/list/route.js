// GET /api/leaders/list                     -> full 57 rows
// GET /api/leaders/list?nuclear=yes|host|no -> filter by nuclear category
// GET /api/leaders/list?minPower=50         -> power >= threshold
// GET /api/leaders/list?search=Modi         -> case-insensitive substring on name OR leader
//
// Static data; safe to cache aggressively at the edge.
export const runtime = "nodejs";

import { allLeaders, applyFilters } from "../../../../lib/leaders";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const params = {
      nuclear: searchParams.get("nuclear") || undefined,
      minPower: searchParams.get("minPower") || undefined,
      search: searchParams.get("search") || undefined,
    };
    const rows = applyFilters(allLeaders(), params);
    return new Response(
      JSON.stringify({ ok: true, count: rows.length, leaders: rows }),
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
      { ok: false, error: "Failed to load leaders." },
      { status: 500 }
    );
  }
}
