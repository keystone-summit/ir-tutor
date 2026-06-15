// Dependency-free RSS / Atom parser. We avoid adding an npm dependency just
// to read feeds — a regex extractor is more than enough for headline + link
// + snippet + date, which is all the seminar pipeline needs.
//
// Handles both RSS 2.0 (<item>) and Atom (<entry>), CDATA sections, and the
// most common date formats. Returns [] on anything it can't parse rather
// than throwing, so one malformed feed never breaks ingestion.

function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&")
    .trim();
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function pick(block, tag) {
  // first <tag ...>...</tag>
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

function pickLink(block) {
  // RSS: <link>url</link> ; Atom: <link href="url" .../>
  const rss = pick(block, "link");
  if (rss && /^https?:/i.test(stripTags(rss))) return stripTags(rss);
  const atom = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  if (atom) return atom[1];
  // Google News wraps the real URL; fall back to guid if it's a url
  const guid = stripTags(pick(block, "guid"));
  if (/^https?:/i.test(guid)) return guid;
  return "";
}

function parseDate(block) {
  const raw =
    stripTags(pick(block, "pubDate")) ||
    stripTags(pick(block, "published")) ||
    stripTags(pick(block, "updated")) ||
    stripTags(pick(block, "dc:date"));
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseFeed(xml) {
  if (!xml || typeof xml !== "string") return [];
  const out = [];
  // RSS items and Atom entries both handled by splitting on either tag.
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const title = stripTags(pick(block, "title"));
    const link = pickLink(block);
    if (!title || !link) continue;
    const desc =
      stripTags(pick(block, "description")) ||
      stripTags(pick(block, "summary")) ||
      stripTags(pick(block, "content"));
    out.push({
      title,
      url: link.trim(),
      snippet: desc.slice(0, 800),
      published_at: parseDate(block),
    });
  }
  return out;
}

// Fetch one feed with a timeout and an identifying User-Agent. Returns
// parsed items, or [] on any failure (caller logs the skip).
export async function fetchFeed(url, { timeoutMs = 9000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "IR-Tutor-Seminar/1.0 (+https://ir-tutor.vercel.app; weekly FP digest)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!r.ok) return { ok: false, status: r.status, items: [] };
    const xml = await r.text();
    return { ok: true, status: r.status, items: parseFeed(xml) };
  } catch (e) {
    return { ok: false, status: 0, items: [], error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}
