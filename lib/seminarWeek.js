// Monday-anchored weekly boundaries for the seminar, computed in ET
// (America/New_York) so a Monday-morning publish always covers the prior
// complete Mon–Sun week regardless of the server's UTC clock.

function etParts(d) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return parts; // { year, month, day, weekday }
}

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function ymdToUTC(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

// Returns { weekStart, weekEnd } (YYYY-MM-DD) for the CURRENT in-progress
// Mon–Sun week relative to `now` in ET. On Tue June 23 -> Jun 22..Jun 28.
//
// CHANGED 2026-06-23: this used to return the most-recent COMPLETE Mon–Sun
// week (e.g. a Monday-morning run produced "Week of <last Monday>"), which made
// every edition read a full week behind the calendar even though the news
// window is the live last-8-days (see generate/route.js — it reads
// `published_at >= now() - 8 days`, NOT the week dates). That label lag was
// repeatedly mistaken for a skipped run. The seminar now always labels itself
// as THIS week; content is unchanged (still the freshest 8 days of news).
export function getSeminarWeek(now = new Date()) {
  const p = etParts(now);
  const todayUTC = ymdToUTC(+p.year, +p.month, +p.day); // ET calendar date as a UTC midnight
  const dow = DOW[p.weekday];
  // days since this week's Monday (Mon=0 ... Sun=6)
  const sinceMon = (dow + 6) % 7;
  const thisMonday = new Date(todayUTC.getTime() - sinceMon * 86400000);
  const thisSunday = new Date(thisMonday.getTime() + 6 * 86400000);
  return { weekStart: iso(thisMonday), weekEnd: iso(thisSunday) };
}

// Plain-language full-week label baked into the stored edition title, e.g.
// "June 22–28, 2026" (UTC-parsed so the day never drifts across a tz boundary).
// Uses a non-spaced en-dash inside the range and reserves the spaced em-dash
// " — " in the title for the week-vs-headline separator (so the voice narrator's
// prefix strip stays unambiguous — see seminarBriefingVoice.briefingNarration).
export function weekRangeLabel(weekStart, weekEnd) {
  const ds = String(weekStart || "").slice(0, 10);
  const de = String(weekEnd || "").slice(0, 10);
  const start = new Date(ds + "T00:00:00Z");
  if (Number.isNaN(start.getTime())) return `Week of ${weekStart}`;
  const opt = { timeZone: "UTC" };
  const sMonth = start.toLocaleDateString("en-US", { ...opt, month: "long" });
  const sDay = start.toLocaleDateString("en-US", { ...opt, day: "numeric" });
  const sYear = start.toLocaleDateString("en-US", { ...opt, year: "numeric" });
  const end = de ? new Date(de + "T00:00:00Z") : null;
  if (!end || Number.isNaN(end.getTime())) return `${sMonth} ${sDay}, ${sYear}`;
  const eMonth = end.toLocaleDateString("en-US", { ...opt, month: "long" });
  const eDay = end.toLocaleDateString("en-US", { ...opt, day: "numeric" });
  const eYear = end.toLocaleDateString("en-US", { ...opt, year: "numeric" });
  const sameMonth = ds.slice(0, 7) === de.slice(0, 7);
  if (sameMonth) return `${sMonth} ${sDay}–${eDay}, ${eYear}`;
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${eYear}`;
}

// Integer week-key used as notes.week_number for course='seminar' saves.
export function weekKey(weekStartIso) {
  return Math.floor(Date.parse(weekStartIso + "T00:00:00Z") / (7 * 86400000));
}

// ---------------------------------------------------------------------
// Freshness / skip-week monitor.
//
// The Monday chain (ingest -> generate -> deepen -> extract -> match)
// publishes one edition per week, labelled by the PRIOR complete Mon–Sun
// week. So the freshest possible edition on any given day is the one whose
// week_start_date == getSeminarWeek().weekStart. If the latest published
// edition is older than that — or no edition has published in > 8 days — a
// Monday run was missed and we raise a "skip" alert.
//
// Pure function (no DB / no I/O) so it can be unit-tested with synthetic
// inputs and reused by both /api/seminar/current (banner) and
// /api/seminar/heartbeat (daily cron self-heal).
// Normalize a DATE value to YYYY-MM-DD. Accepts a pg Date object (whose
// String() is a locale string like "Mon Jun 15 2026"), an ISO string, or a
// plain "YYYY-MM-DD" — all collapse to the same canonical day key.
function isoDay(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v);
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function seminarHealth({ latestWeekStart, latestPublishedAt, now = new Date() }) {
  const expected = getSeminarWeek(now).weekStart;
  const latest = isoDay(latestWeekStart);
  const upToDate = latest != null && latest === expected;

  let daysSincePublished = null;
  if (latestPublishedAt) {
    const t = new Date(latestPublishedAt).getTime();
    if (Number.isFinite(t)) daysSincePublished = Math.floor((now.getTime() - t) / 86400000);
  }

  // Skip = a Monday was missed. No edition ever, or the last publish is more
  // than 8 days old (a normal week is 7 days; 8 gives a one-day grace cushion).
  const skip = daysSincePublished == null ? true : daysSincePublished > 8;

  // Mid-week (Thursday) refresh check. The current-week edition is regenerated
  // every Thursday to fold in mid-week news. The Thursday chain runs 10:00–13:30
  // UTC, so by Thursday 14:00 UTC the latest publish should be from Thursday. If
  // it's still from before this week's Thursday, the Thursday run was missed and
  // the daily heartbeat self-heals it. Thresholds are derived from the current
  // week's Monday (parsed as UTC midnight — approximate but consistent).
  const thisMondayMs = Date.parse(expected + "T00:00:00Z");
  const thursdayStartMs = Number.isFinite(thisMondayMs) ? thisMondayMs + 3 * 86400000 : NaN; // Thu 00:00 UTC
  const midWeekDueMs = Number.isFinite(thisMondayMs) ? thisMondayMs + 3 * 86400000 + 14 * 3600000 : NaN; // Thu 14:00 UTC
  const midWeekDue = Number.isFinite(midWeekDueMs) && now.getTime() >= midWeekDueMs;
  let midWeekStale = false;
  if (midWeekDue) {
    const t = latestPublishedAt ? new Date(latestPublishedAt).getTime() : NaN;
    midWeekStale = !Number.isFinite(t) || t < thursdayStartMs;
  }

  return {
    expected_week_start: expected,
    latest_week_start: latest,
    up_to_date: upToDate,
    days_since_published: daysSincePublished,
    skip,
    mid_week_due: midWeekDue,
    mid_week_stale: midWeekStale,
    healthy: upToDate && !skip && !midWeekStale,
  };
}
