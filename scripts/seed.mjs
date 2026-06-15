// One-time Week-1 seed that runs the REAL seminar route handlers locally
// against the live Supabase DB — proving the pipeline end-to-end before
// deploy. Same code path prod uses (ingest -> generate), only the Vercel
// wrapper + cron scheduler are bypassed.
//
// Required env (set on the command line, never hardcode secrets here):
//   SUPABASE_DB_URL       session-pooler connection string
//   ANTHROPIC_API_KEY     Anthropic key
//   SEMINAR_CRON_SECRET   any value; used as the bearer for the fake request
//   IRTUTOR_AUTH_SECRET   not needed (we use the cron-secret path)
//
//   node scripts/seed.mjs [ingest|generate|both]   (default both)

const SECRET = process.env.SEMINAR_CRON_SECRET || "seed-local";
const step = process.argv[2] || "both";

function reqFor(path) {
  return new Request("http://localhost" + path, {
    method: "POST",
    headers: { authorization: "Bearer " + SECRET, "content-type": "application/json" },
  });
}

async function run() {
  if (step === "ingest" || step === "both") {
    const { POST } = await import("../app/api/seminar/ingest/route.js");
    const res = await POST(reqFor("/api/seminar/ingest"));
    const j = await res.json();
    console.log("=== INGEST ===");
    console.log("status:", res.status, "sources_ok:", j.sources_ok, "/", j.sources_total,
      "items_inserted:", j.items_inserted, "items_fetched:", j.items_fetched);
    if (j.report) {
      const failed = j.report.filter((r) => !r.ok);
      console.log("failed sources:", failed.map((f) => `${f.source}(${f.status || f.error})`).join(", ") || "none");
    }
  }

  if (step === "generate" || step === "both") {
    const { POST } = await import("../app/api/seminar/generate/route.js");
    const res = await POST(reqFor("/api/seminar/generate"));
    const j = await res.json();
    console.log("=== GENERATE ===");
    console.log("status:", res.status);
    console.log(JSON.stringify(j, null, 2));
  }
}

run().then(() => { console.log("SEED DONE"); process.exit(0); })
     .catch((e) => { console.error("SEED ERROR:", e); process.exit(1); });
