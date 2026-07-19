// /leaders/<slug> — Single country brief. Server-rendered from the on-disk
// dataset; no client fetch, no auth, no JS required to see the content.
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { allLeaders, findBySlug } from "../../../lib/leaders";

export const dynamic = "force-static";
export const revalidate = 86400;
// Allow unknown/uppercase params through so we can 301-redirect them to their
// lowercase canonical form (HOTFIX 2) or render the branded not-found page
// (HOTFIX 1) instead of Next.js's default black 404.
export const dynamicParams = true;

export function generateStaticParams() {
  return allLeaders().map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }) {
  const c = findBySlug(params.slug);
  if (!c) return { title: "Country not found — Keystone Atlas" };
  return {
    title: `${c.name} — Keystone Atlas`,
    description: `${c.leader}. ${c.why}`,
  };
}

function nuclearBadge(cat, text) {
  if (cat === "yes") return { cls: "nuc-yes", label: `☢ ${text}` };
  if (cat === "host") return { cls: "nuc-host", label: `☢ ${text}` };
  return { cls: "nuc-no", label: text };
}

export default function CountryBriefPage({ params }) {
  // HOTFIX 2 (page side): case-normalize by permanently redirecting any
  // mixed-case slug to its lowercased canonical URL. Example:
  //   /leaders/UNITED-STATES  ->  308  ->  /leaders/united-states
  // Next 14 `permanentRedirect()` responds 308 (Permanent Redirect); for
  // GET-only atlas pages this is functionally equivalent to a 301 and both
  // Google and Bing treat 308 as permanent for canonicalization/caching.
  const rawSlug = params?.slug || "";
  const lowerSlug = rawSlug.toLowerCase();
  if (rawSlug !== lowerSlug) {
    permanentRedirect(`/leaders/${lowerSlug}`);
  }

  const c = findBySlug(lowerSlug);
  if (!c) notFound();
  const badge = nuclearBadge(c.nuclear_category, c.nuclear);

  return (
    <div className="ldr-root">
      <header className="ldr-top">
        <Link href="/leaders" className="ldr-back">
          ← Back to Atlas
        </Link>
        <div className="ldr-brand">
          <div className="ldr-code">KEYSTONE ATLAS · #{c.rank} · {c.region}</div>
          <div className="ldr-name">{c.name}</div>
        </div>
        <nav className="ldr-topnav">
          <Link href="/leaders" className="ldr-topnav-item">Overview</Link>
          <Link href="/leaders/study" className="ldr-topnav-item">Study Mode</Link>
        </nav>
      </header>

      <main className="ldr-brief">
        <section className="ldr-hero">
          <div className="ldr-hero-flag" aria-hidden>{c.flag || "🏳"}</div>
          <div className="ldr-hero-body">
            <div className="ldr-hero-kicker">RANK #{c.rank}</div>
            <h1>{c.name}</h1>
            <div className="ldr-hero-meta">
              <span className="ldr-pill ldr-pill-power">Power {c.power}</span>
              <span className="ldr-pill ldr-pill-region">{c.region}</span>
              <span className={`ldr-pill ldr-pill-nuc ${badge.cls}`}>{badge.label}</span>
            </div>
          </div>
        </section>

        <section className="ldr-brief-grid">
          <article className="ldr-card">
            <h3>Leader</h3>
            <p className="ldr-big">{c.leader}</p>
            <dl className="ldr-dl">
              <dt>Party</dt><dd>{c.party || "—"}</dd>
              <dt>In office since</dt><dd>{c.tenure || "—"}</dd>
            </dl>
          </article>

          <article className="ldr-card">
            <h3>Top Diplomat</h3>
            <p>{c.diplomat || "—"}</p>
          </article>

          <article className="ldr-card">
            <h3>Defense</h3>
            <p>{c.defense || "—"}</p>
          </article>

          <article className="ldr-card">
            <h3>Security / Intelligence</h3>
            <p>{c.intel || "—"}</p>
          </article>
        </section>

        <section className="ldr-why">
          <div className="ldr-why-kicker">WHY IT MATTERS TO THE US</div>
          <p>{c.why || "—"}</p>
        </section>

        <div className="ldr-brief-actions">
          <Link href="/leaders" className="ldr-btn">← All 57 countries</Link>
          <Link href="/leaders/study" className="ldr-btn ldr-btn-primary">Study Mode →</Link>
        </div>
      </main>
    </div>
  );
}
