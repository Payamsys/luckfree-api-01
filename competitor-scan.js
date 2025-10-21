// api/competitor-scan.js
const CATALOG = {
  skincare: [
    "The Ordinary", "CeraVe", "La Roche-Posay",
    "The INKEY List", "Paula’s Choice", "Bioderma", "Avene", "Eucerin"
  ]
};

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*'); // for Base44
    const url = new URL(req.url, `http://${req.headers.host}`);
    const brand = url.searchParams.get('brand') || 'The Ordinary';
    const region = (url.searchParams.get('region') || 'ES').toUpperCase();
    const category = (url.searchParams.get('category') || 'skincare').toLowerCase();
    const peers = CATALOG[category] || [];
    const since = new Date(); since.setDate(since.getDate() - 30);
    const from = since.toISOString().split('T')[0];
    const lang = region === 'ES' ? 'es' : 'en';
    const NEWS_API = process.env.NEWS_API_KEY;
    if (!NEWS_API) return res.status(500).json({ error: 'Missing NEWS_API_KEY' });

    const fetchPeer = async (peer) => {
      const q = encodeURIComponent(peer);
      const endpoint =
        `https://newsapi.org/v2/everything?q=${q}&from=${from}&language=${lang}&sortBy=popularity&pageSize=10&apiKey=${NEWS_API}`;
      const r = await fetch(endpoint);
      const data = await r.json();
      const articles = (data.articles || []).map(a => ({
        title: a.title, source: a.source?.name, url: a.url, publishedAt: a.publishedAt
      }));
      return { peer, count: articles.length, articles };
    };

    const results = await Promise.all(
      peers.filter(p => p.toLowerCase() !== brand.toLowerCase()).map(fetchPeer)
    );
    const ranked = results.sort((a,b)=>b.count-a.count).slice(0,5);

    const recommendation = ranked.length
      ? {
          text: `Momentum this month is led by ${ranked[0].peer}. Track their launches and test one reactive content piece this week.`,
          next_steps: [
            "Add top competitor to watchlist; enable weekly alert",
            "Review pricing/landing copy vs. highest-activity peer",
            "Publish one reactive post based on a cited article"
          ],
          risk: "low"
        }
      : { text: `Low public activity in ${region}. Maintain plan; re-check next week.`,
          next_steps: ["Schedule auto re-run next Monday"], risk: "none" };

    res.status(200).json({
      brand, region, category,
      top_competitors: ranked.map(({peer,count})=>({peer,count})),
      recommendation,
      citations: ranked.flatMap(r=>r.articles.slice(0,2))
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'server error' });
  }
}
