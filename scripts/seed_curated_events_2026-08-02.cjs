// One-off: append 10 curated events to seminar edition 19 (Week of Jul 27 - Aug 2, 2026)
// and refresh the edition's stored region_coverage so the balance strip stays truthful.
// Idempotent: deletes any prior curated rows for the edition before inserting.
const fs = require("fs");
const { Client } = require("pg");

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const EDITION_ID = 19;

const EVENTS = [
  {
    rank: 6,
    region_bucket: "europe_russia",
    title: "Roughly 60,000 Migrants Cross from Morocco into Spain's Ceuta Enclave in a Matter of Days",
    summary:
      "Spain's North African enclave of Ceuta was overwhelmed when tens of thousands of people crossed from Morocco by land and sea over a matter of days, a figure larger than half the city's population, with Spain's Interior Ministry reporting roughly 50,000 arrivals in a single 24-hour period. The death toll from the crossings climbed to 67, most of them drownings, as crowds swam around the maritime barriers and overwhelmed border guards. Madrid mobilised the army, installed a 500-metre floating barrier off the Moroccan border and declared the situation under control by the weekend, with most of those who crossed already returned to Morocco.",
    reasoning:
      "A mass-arrival event of this scale at an EU external border is the first real stress test of the bloc's newly operative asylum architecture, and it demonstrates how fast a partner state's border management can convert into a continental political crisis with knock-on effects for Schengen, Spanish domestic stability and the leverage Rabat holds over Europe.",
    source_name: "CNN",
    source_region: "United States",
    source_url: "https://www.cnn.com/2026/07/31/europe/spain-ceuta-migrants-intl",
  },
  {
    rank: 7,
    region_bucket: "europe_russia",
    title: "Italy Suspends Schengen Free Movement with Spain as France Tightens Its Border After Ceuta",
    summary:
      "Italy's government temporarily reintroduced Schengen border controls with Spain, applying 'targeted and selective' checks on non-EU travellers at airports and seaports, the two countries sharing no land border. The measure was announced Thursday evening by Prime Minister Giorgia Meloni alongside Deputy Prime Ministers Antonio Tajani and Matteo Salvini, and formally approved by Interior Minister Matteo Piantedosi the following morning; EU citizens are unaffected. France separately strengthened controls along its land border with Spain, while European Commissioner Magnus Brunner called the situation in Ceuta 'unacceptable' and stressed that existing Schengen provisions apply to Ceuta and Melilla.",
    reasoning:
      "Two founding Schengen members reimposing internal controls against a third over a single migration event shows how quickly the EU's free-movement core degrades under pressure, which matters to Washington because a fragmenting Schengen weakens Europe as a coherent security and economic partner precisely when US strategy on Russia, Iran and China depends on European cohesion.",
    source_name: "Euronews",
    source_region: "Europe",
    source_url:
      "https://www.euronews.com/my-europe/2026/07/31/italy-suspends-schengen-with-spain-over-ceuta-migrant-crisis-shuts-air-and-sea-borders",
  },
  {
    rank: 8,
    region_bucket: "europe_russia",
    title: "Ceuta Becomes the Hardest Political Test Yet for Spain's Pedro Sánchez",
    summary:
      "Spain's Prime Minister Pedro Sánchez, who built an international profile as one of the few European leaders willing to defend migration on humanitarian and economic grounds, faces the sharpest challenge of his tenure after the Ceuta crossings. Sánchez denounced what he called the 'selfish' response of several EU member states, which moved to restrict travel from Spain rather than share the burden of the arrivals. The episode puts his governing coalition under strain at a moment when the Spanish right and hard right have made irregular migration their central line of attack.",
    reasoning:
      "Sánchez's political survival is a bellwether for whether any major European government can hold a liberal migration line under mass-arrival pressure, and a government crisis in Madrid would destabilise a NATO member and the euro zone's fourth-largest economy at a moment when Washington is counting on European unity across several simultaneous crises.",
    source_name: "NPR",
    source_region: "United States",
    source_url: "https://www.npr.org/2026/08/01/nx-s1-5916330/spain-sanchez-ceuta-migrants",
  },
  {
    rank: 9,
    region_bucket: "europe_russia",
    title: "The EU's Migration and Asylum Pact Takes Effect, Shifting the Bloc Toward Detention and Externalisation",
    summary:
      "The EU Pact on Migration and Asylum became applicable on 12 June 2026, replacing the bloc's previous asylum framework with a screening process of up to seven days followed by a fast-track border procedure of up to twelve weeks, during which most applicants are likely to be held in detention. Nationals of countries with EU-wide recognition rates of 20 percent or below are automatically channelled into that expedited track, and member states may declare claims inadmissible on 'safe third country' grounds even where the applicant has no meaningful ties to the country in question. Solidarity is no longer relocation-based: states may pay instead of accepting asylum seekers. Human Rights Watch argues the package prioritises restriction over protection and raises non-refoulement risks.",
    reasoning:
      "This is the legal machinery through which every subsequent European border event, Ceuta included, will now be adjudicated, and it marks the EU converging on a deterrence-and-externalisation model much closer to US border policy, reducing transatlantic friction on migration while creating new legal exposure that adversaries will exploit in the information domain.",
    source_name: "Human Rights Watch",
    source_region: "Think-tank / OSINT",
    source_url: "https://www.hrw.org/news/2026/06/10/questions-and-answers-the-eu-pact-on-migration-and-asylum",
  },
  {
    rank: 10,
    region_bucket: "americas",
    title: "US Boat-Strike Campaign Against Alleged Traffickers Hits Its Longest Pause in Eleven Months",
    summary:
      "The US military's campaign of lethal strikes on vessels it says are carrying narcotics in the Caribbean and eastern Pacific entered its longest pause since the operation began roughly eleven months earlier. Law-enforcement officials told CNN they remain uncertain what lasting effect the strikes have had on trafficking, and outside experts were sceptical the campaign will meaningfully change the drug trade. Independent tallies put the campaign at more than sixty strikes and over two hundred people killed since it started in September 2025.",
    reasoning:
      "The pause forces the question the campaign has never answered, whether killing crews at sea does anything durable to supply, and how Washington resolves it determines whether the US keeps treating narcotics trafficking as an armed conflict, a framing that has already strained relations across Latin America and left unresolved war-powers questions in Congress.",
    source_name: "CNN",
    source_region: "United States",
    source_url: "https://www.cnn.com/2026/07/26/politics/boat-strikes-cocaine-drugs-united-states-military",
  },
  {
    rank: 11,
    region_bucket: "americas",
    title: "Crisis Group: Mexico's Sinaloa Offensive Has Not Reduced Fentanyl Availability in the United States",
    summary:
      "The International Crisis Group reported that despite thousands of arrests and the destruction of numerous laboratories in Sinaloa, Mexico's fentanyl production heartland, the campaign has done little to reduce the drug's availability in the United States or to weaken the networks behind the trade. US officials told the group's researchers that the cartel conflict has had no noticeable effect on fentanyl prices or availability in major American cities. Mexico's military has suppressed the worst urban fighting between rival Sinaloa Cartel factions, but the front lines have shifted to rural areas and the trade continues; the report urges Mexico City to use US pressure to attack the official collusion and corruption that sustains organised crime.",
    reasoning:
      "If the most intensive Mexican operation in years moves neither price nor availability, the core assumption behind the US supply-side toolkit of tariffs, terrorist designations and strike threats is wrong, and Washington is paying real diplomatic friction with its largest trading partner without buying a measurable reduction in American overdose risk.",
    source_name: "International Crisis Group",
    source_region: "Think-tank / OSINT",
    source_url: "https://www.crisisgroup.org/sites/default/files/2026-07/112-mexico-sinaloa.pdf",
  },
  {
    rank: 12,
    region_bucket: "americas",
    title: "Sheinbaum Fights Cartels at Home to Keep US Forces Out, Invoking Mexico's Long Memory of Intervention",
    summary:
      "Mexican President Claudia Sheinbaum is pressing a domestic crackdown on organised crime in large part to deter US military action on Mexican soil, having repeatedly rejected Trump administration suggestions of unilateral strikes with the formula 'cooperation, yes; subordination and intervention, no.' Her defence of sovereignty has strengthened her position at home, with approval polling around 68 percent, even as the Sinaloa Cartel's internal war continues to generate killings and displacement. Al Jazeera sets the standoff against the legacy of 1968 and Mexico's constitutional bar on foreign intervention.",
    reasoning:
      "Sheinbaum's bargain, delivering enough enforcement to forestall US action without conceding sovereignty, is the load-bearing structure of the entire bilateral relationship, and if it fails Washington faces a choice between unilateral action that would rupture ties with its largest trading partner ahead of the USMCA review and accepting a level of enforcement it has already called insufficient.",
    source_name: "Al Jazeera",
    source_region: "Qatar",
    source_url:
      "https://www.aljazeera.com/features/longform/2026/7/11/sheinbaum-takes-on-cartels-trump-and-the-legacy-of-1968",
  },
  {
    rank: 13,
    region_bucket: "middle_east",
    title: "Board of Peace Announces a Staged Hamas Disarmament Deal; Hamas Attaches Conditions Israel Rejects",
    summary:
      "The US-led Board of Peace announced that mediators from Egypt, Qatar, Turkey and the United States had finalised a roadmap under which Hamas would surrender its weapons in stages while Israel withdrew from Gaza over a period of time, the first time Hamas has agreed to a specific disarmament plan. Hamas subsequently said it would not implement any part of the deal unless Israeli forces meet their own withdrawal obligations, and tied disarmament to further conditions including the eventual establishment of a Palestinian state, which President Trump did not mention in his announcement and which Israel rejects. Prime Minister Netanyahu remained publicly silent in the immediate aftermath.",
    reasoning:
      "A durable Hamas disarmament would be the largest single change to the region's security map in a decade and would free Israeli and American attention for the Iran confrontation, but the conditions attached are precisely the terms that have collapsed every previous framework, which makes the gap between announcement and implementation the thing to watch rather than the announcement itself.",
    source_name: "Al Jazeera",
    source_region: "Qatar",
    source_url: "https://www.aljazeera.com/news/2026/7/31/gaza-board-of-peace-announces-hamas-disarmament-agreement-what-we-know",
  },
  {
    rank: 14,
    region_bucket: null,
    title: "ICC Member States Vote to Remove Chief Prosecutor Karim Khan, the First Such Removal in the Court's History",
    summary:
      "The Assembly of States Parties to the International Criminal Court voted at a special session held at UN headquarters in New York to remove Prosecutor Karim Khan from office, following sexual-misconduct allegations first reported roughly two years earlier, which Khan has consistently denied. The vote was 82 in favour, 13 against and 15 abstentions among the court's 125 member states. No ICC chief prosecutor had ever been removed before.",
    reasoning:
      "The prosecutor's office carries the court's most politically loaded files, including matters touching Israel and Russia, so a leadership rupture at the top of the ICC reshapes the legal terrain on which allies and adversaries contest legitimacy and hands states already hostile to the court a ready-made argument about its credibility.",
    source_name: "NPR",
    source_region: "United States",
    source_url: "https://www.npr.org/2026/07/24/g-s1-135498/icc-court-prosecutor-karim-khan-vote",
  },
  {
    rank: 15,
    region_bucket: "brics_trade",
    title: "Saudi Arabia Halts Red Sea Oil Exports and Strikes Houthi Targets After Attacks on Its Tankers",
    summary:
      "Saudi Arabia temporarily halted crude shipments through its Red Sea lane after Houthi attacks on two large Saudi oil tankers, and the Saudi military struck Iran-backed Houthi targets inside Yemen in response. The Houthis had declared a maritime embargo against the kingdom, threatening to cut off its oil exports through the Red Sea and the Bab el-Mandeb Strait, and claimed a further missile attack on a Saudi tanker on 28 July. The escalation opens a second pressure point on Gulf energy exports alongside the disruption already affecting the Strait of Hormuz.",
    reasoning:
      "A non-state actor able to threaten both of Saudi Arabia's seaborne export routes at once turns Yemen from a peripheral theatre into a hinge of global energy supply, and every additional week of interrupted Saudi exports transmits directly into US fuel prices, inflation expectations and the political bandwidth Washington retains for the Iran campaign.",
    source_name: "CNBC",
    source_region: "United States",
    source_url: "https://www.cnbc.com/2026/07/25/saudi-military-strikes-iran-backed-houthi-targets-yemen.html",
  },
];

(async () => {
  const c = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // 1) migration
  const mig = fs.readFileSync("supabase_migration_seminar_curated.sql", "utf8");
  await c.query(mig);
  console.log("migration applied");

  // 2) idempotent re-seed
  const del = await c.query(
    "delete from public.seminar_events where seminar_id = $1 and curated = true",
    [EDITION_ID]
  );
  console.log("cleared prior curated rows:", del.rowCount);

  for (const e of EVENTS) {
    await c.query(
      `insert into public.seminar_events
         (seminar_id, rank, title, summary, reasoning, source_url, source_name, source_region, region_bucket, curated)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
      [
        EDITION_ID,
        e.rank,
        e.title,
        e.summary,
        e.reasoning,
        e.source_url,
        e.source_name,
        e.source_region,
        e.region_bucket,
      ]
    );
  }
  console.log("inserted:", EVENTS.length);

  // 3) recompute stored region_coverage from ALL events on the edition, so the
  //    "Regional balance" pills show real counts rather than the stale auto-5.
  const all = await c.query(
    "select region_bucket from public.seminar_events where seminar_id = $1",
    [EDITION_ID]
  );
  const cov = {};
  for (const r of all.rows) if (r.region_bucket) cov[r.region_bucket] = (cov[r.region_bucket] || 0) + 1;
  const BUCKETS = ["middle_east", "asia", "americas", "europe_russia", "brics_trade"];
  const under = BUCKETS.filter((b) => !cov[b]);
  await c.query(
    `update public.seminar_editions
        set region_coverage = $2::jsonb, underweighted_regions = $3::text[], updated_at = now()
      where id = $1`,
    [EDITION_ID, JSON.stringify(cov), under]
  );
  console.log("region_coverage:", JSON.stringify(cov), "underweighted:", JSON.stringify(under));

  const chk = await c.query(
    "select rank, curated, region_bucket, source_name, left(title,72) as title from public.seminar_events where seminar_id=$1 order by rank",
    [EDITION_ID]
  );
  console.table(chk.rows);
  await c.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
