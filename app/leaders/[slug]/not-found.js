// Branded 404 for unknown /leaders/<slug> paths. Rendered automatically when
// the [slug] page calls notFound(), and also when Next.js resolves an unknown
// path under /leaders/. Uses the same Keystone Atlas design tokens as the
// rest of /leaders so unknown-country pages still feel like the atlas.
import Link from "next/link";

// Popular country slugs surfaced as jump-off links. These match slugify() in
// lib/leadersMeta.js — verified against data/leaders_57.json.
const POPULAR = [
  { slug: "united-states", name: "United States", flag: "🇺🇸" },
  { slug: "china", name: "China", flag: "🇨🇳" },
  { slug: "russia", name: "Russia", flag: "🇷🇺" },
  { slug: "india", name: "India", flag: "🇮🇳" },
  { slug: "israel", name: "Israel", flag: "🇮🇱" },
  { slug: "iran", name: "Iran", flag: "🇮🇷" },
];

export const metadata = {
  title: "Country not in the atlas — Keystone Atlas",
  description: "That slug doesn't match any of the 57 countries in Keystone Atlas.",
};

export default function LeaderNotFound() {
  return (
    <div className="ldr-root">
      <header className="ldr-top">
        <Link href="/leaders" className="ldr-back" aria-label="Back to atlas">
          ← Atlas
        </Link>
        <div className="ldr-brand">
          <div className="ldr-code">KEYSTONE ATLAS · 404</div>
          <div className="ldr-name">Country not in the atlas</div>
        </div>
        <nav className="ldr-topnav">
          <Link href="/leaders" className="ldr-topnav-item">Overview</Link>
          <Link href="/leaders/study" className="ldr-topnav-item">Study Mode</Link>
        </nav>
      </header>

      <main className="ldr-brief">
        <section className="ldr-hero">
          <div className="ldr-hero-flag" aria-hidden>🏳</div>
          <div className="ldr-hero-body">
            <div className="ldr-hero-kicker">NOT FOUND</div>
            <h1>Country not in the atlas</h1>
            <div className="ldr-hero-meta">
              <span className="ldr-pill ldr-pill-region">The atlas covers 57 countries</span>
            </div>
          </div>
        </section>

        <section className="ldr-why">
          <div className="ldr-why-kicker">TRY ONE OF THESE</div>
          <p>
            The atlas covers 57 countries. Try one of these:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {POPULAR.map((c) => (
              <Link
                key={c.slug}
                href={`/leaders/${c.slug}`}
                className="ldr-pill ldr-pill-region"
                style={{ textDecoration: "none", fontSize: 13, padding: "6px 12px" }}
              >
                <span aria-hidden style={{ marginRight: 6 }}>{c.flag}</span>
                {c.name}
              </Link>
            ))}
          </div>
        </section>

        <div className="ldr-brief-actions">
          <Link href="/leaders" className="ldr-btn ldr-btn-primary">← Back to all 57 countries</Link>
          <Link href="/leaders/study" className="ldr-btn">Study Mode →</Link>
        </div>
      </main>
    </div>
  );
}
