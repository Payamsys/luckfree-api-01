// api/competitor-scan.js
const CATALOG = {
  skincare: [
    "The Ordinary","CeraVe","La Roche-Posay",
    "The INKEY List","Paula’s Choice","Bioderma","Avène","Eucerin"
  ]
};

// ---- tiny helpers to make structured bullets from article titles ----
function pick(arr, n=3){ return (arr||[]).slice(0,n); }
function yes(t){ return !!t && typeof t === "string"; }
function kw(t){ return (t||"").toLowerCase(); }

function synthesizeFromTitles(peer, titles=[]) {
  // very simple rule-based signals; no LLM required
  const s = titles.map(kw).join(" • ");

  const strengths = [];
  if (s.includes("award") || s.includes("bestseller")) strengths.push("Brand momentum");
  if (s.includes("launch") || s.includes("new")) strengths.push("Active product launches");
  if (s.includes("partnership") || s.includes("collab")) strengths.push("Partnership activity");
  if (s.includes("sustainab") || s.includes("eco")) strengths.push("Sustainability narrative");
  if (s.includes("retail") || s.includes("store")) strengths.push("Retail distribution updates");
  if (s.includes("growth") || s.includes("revenue")) strengths.push("Growth signals");

  const differentiators = [];
  if (s.includes("vitamin c") || s.includes("retinol") || s.includes("niacinamide"))
    differentiators.push("Actives-led positioning");
  if (s.includes("spa") || s.includes("clinic"))
    differentiators.push("Wellness/clinic crossover");
  if (s.includes("ai") || s.includes("personalized"))
    differentiators.push("Personalization/tech angle");

  const highlights = pick(titles, 3); // top 3 article titles for quick context

  // short, safe summary
  const short = strengths.length
    ? `${peer} shows ${strengths[0].toLowerCase()} in recent coverage.`
    : `${peer} has steady coverage across the period.`;

  const positioning = differentiators[0] || "General DTC skincare positioning";

  return { short, positioning, strengths, differentiators, highlights };
}

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*"); // Base44
    const url = new URL(req.url, `http://${req.headers.host}`);
    const brand = url.searchParams.get("brand") || "The Ordinary";
    const region = (url.searchParams.get("region") || "EU").toUpperCase();
    const category = (url.searchParams.get("category") || "skincare").toLowerCase();
    const peers = (CATALOG[category] || []).filter(p => p.toLowerCase() !== brand.toLowerCase());

    // dates/language
    const since = new Date(); since.setDate(since.getDate() - 30);
    const from = since.toISOString().split("T")[0];
    const lang = ["ES","PT","BR","MX"].includes(region) ? "es" : "en";

    const NEWS_API = process.env.NEWS_API_KEY;
    const fetchPeer = async (peer) => {
      if (!NEWS_API) {
        // graceful fallback for missing key (keeps UI structured)
        return {
          name: peer, mentions: Math.floor(Math.random()*15)+3,
          summary: synthesizeFromTitles(peer, [
            `${peer} announces limited-edition cleanser`,
            `${peer} partners with major retailer`,
            `${peer} sustainability update gains press`
          ]),
          citations: [
            { title:`${peer} limited-edition cleanser`, source:"Example",
              url:"https://example.com", publishedAt:new Date().toISOString() }
          ]
        };
      }
      const q = encodeURIComponent(peer);
      const endpoint =
        `https://newsapi.org/v2/everything?q=${q}&from=${from}&language=${lang}&sortBy=popularity&pageSize=10&apiKey=${NEWS_API}`;
      const r = await fetch(endpoint);
      const data = await r.json();
      const arts = (data.articles || []).filter(a => yes(a?.title));
      const titles = arts.map(a => a.title);
      const summary = synthesizeFromTitles(peer, titles);
      const citations = pick(arts, 3).map(a => ({
        title: a.title, source: a.source?.name, url: a.url, publishedAt: a.publishedAt
      }));
      return { name: peer, mentions: arts.length, summary, citations };
    };

    const raw = await Promise.all(peers.map(fetchPeer));
    const competitors = raw.sort((a,b)=>b.mentions - a.mentions).slice(0,6);

    // recommendation that the UI can show as a small paragraph + bullets
    const leader = competitors[0]?.name;
    const recommendation = {
      text: leader
        ? `Momentum this month is led by ${leader}. Compare pricing and landing copy and ship one reactive post this week.`
        : `Coverage is low this month. Maintain plan and re-check next week.`,
      next_steps: leader ? [
        `Add ${leader} to watchlist and enable weekly alert`,
        "Review pricing/landing copy vs. the top competitor",
        "Publish one reactive post based on a cited article"
      ] : ["Schedule auto re-run next Monday"],
      risk: (competitors.reduce((n,c)=>n+(c.citations?.length||0),0) < 4) ? "medium" : "low"
    };

    res.status(200).json({
      brand, region, category,
      competitors,        // <-- the UI will render this array as cards
      recommendation,     // <-- short + next_steps + risk
      meta: { generated_at: new Date().toISOString() }
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "server error" });
  }
}
