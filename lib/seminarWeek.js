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
