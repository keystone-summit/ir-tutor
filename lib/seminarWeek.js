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

// Returns { weekStart, weekEnd } (YYYY-MM-DD) for the most recent COMPLETE
// Mon–Sun week relative to `now` in ET. On Monday June 15 -> Jun 8..Jun 14.
export function getSeminarWeek(now = new Date()) {
  const p = etParts(now);
  const todayUTC = ymdToUTC(+p.year, +p.month, +p.day); // ET calendar date as a UTC midnight
  const dow = DOW[p.weekday];
  // days since this week's Monday (Mon=0 ... Sun=6)
  const sinceMon = (dow + 6) % 7;
  const thisMonday = new Date(todayUTC.getTime() - sinceMon * 86400000);
  const prevMonday = new Date(thisMonday.getTime() - 7 * 86400000);
  const prevSunday = new Date(thisMonday.getTime() - 1 * 86400000);
  return { weekStart: iso(prevMonday), weekEnd: iso(prevSunday) };
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

  return {
    expected_week_start: expected,
    latest_week_start: latest,
    up_to_date: upToDate,
    days_since_published: daysSincePublished,
    skip,
    healthy: upToDate && !skip,
  };
}
