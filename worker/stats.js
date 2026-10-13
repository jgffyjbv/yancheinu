/**
 * Visitor counting, kept in the site's own small database (D1) — no cookies and no outside service.
 *
 * A "visitor" is one browser on one day. To tell browsers apart without storing anything personal, the
 * address and browser name are scrambled together with a secret that changes every day; only that scramble
 * is kept, and it cannot be turned back into an address or followed from one day to the next.
 *
 * (KV would be the wrong place for this: its counters lose clicks that arrive close together.)
 */
import { hmac } from './lib.js';

const BOTS = /bot\b|bot[\/;) ]|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|telegram|monitor|uptime|pingdom|statuscake|headless|lighthouse|pagespeed|gtmetrix|curl|wget|python|httpclient|http-client|go-http|java\/|okhttp|axios|node-fetch|undici|scrapy|semrush|ahrefs|mj12|dotbot|yandex|baidu|petal|bytespider|gptbot|chatgpt|claude|anthropic|perplexity|ccbot|amazonbot|applebot|ia_archiver|feedfetcher|google-|chrome-lighthouse|scan|check|validator|fetch|libwww|wordpress|zgrab|masscan|nmap/i;

// the site's day runs on Brooklyn time
export const dayOf = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const today = () => dayOf(new Date());
export const daysAgo = (n) => dayOf(new Date(Date.now() - n * 86400000));

function sourceOf(request, url) {
  const tag = (url.searchParams.get('utm_source') || '').replace(/[^\w .-]/g, '').slice(0, 40);
  if (tag) return 'Campaign: ' + tag;
  let host = '';
  try { host = new URL(request.headers.get('referer') || '').hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { /* no referrer */ }
  if (!host || host === url.hostname.replace(/^www\./, '')) return 'Direct (typed, bookmark, or a link in a message)';
  if (/(^|\.)google\./.test(host)) return host.startsWith('mail.') ? 'Gmail' : 'Google';
  if (/(^|\.)bing\.com$/.test(host)) return 'Bing';
  if (/duckduckgo/.test(host)) return 'DuckDuckGo';
  if (/(^|\.)yahoo\./.test(host)) return 'Yahoo';
  if (/facebook\.com$|fb\.com$|fb\.me$/.test(host)) return 'Facebook';
  if (/instagram\.com$/.test(host)) return 'Instagram';
  if (/whatsapp\.com$|wa\.me$/.test(host)) return 'WhatsApp';
  if (/linkedin\.com$|lnkd\.in$/.test(host)) return 'LinkedIn';
  if (/(^|\.)t\.co$|twitter\.com$|x\.com$/.test(host)) return 'X (Twitter)';
  if (/chatgpt\.com$|openai\.com$/.test(host)) return 'ChatGPT';
  return host.slice(0, 60);
}

function deviceOf(ua) {
  if (/ipad|tablet|kindle|silk|playbook/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'Tablet';
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return 'Phone';
  return 'Computer';
}

/** Should this request be counted as a person looking at a page? */
export function countable(request) {
  if (request.method !== 'GET') return false;
  const ua = request.headers.get('user-agent') || '';
  if (ua.length < 20 || BOTS.test(ua)) return false;
  const h = (name) => (request.headers.get(name) || '').toLowerCase();
  if (h('sec-purpose').includes('prefetch') || h('purpose') === 'prefetch' || h('x-moz') === 'prefetch') return false;
  const dest = h('sec-fetch-dest');
  if (dest && dest !== 'document') return false;
  return h('accept').includes('text/html');
}

/** Count one page view. Never throws: a counting problem must not disturb the page. */
export async function record(request, env, path) {
  if (!env.DB) return;
  try {
    const url = new URL(request.url);
    const day = today();
    const ua = request.headers.get('user-agent') || '';
    const ip = request.headers.get('cf-connecting-ip') || '';
    const salt = await hmac(env.SESSION_SECRET || env.ADMIN_PASSWORD || 'yancheinu', 'visitor:' + day);
    const vid = (await hmac(salt, ip + '|' + ua)).slice(0, 20);
    const first = await env.DB.prepare('INSERT OR IGNORE INTO uniq (day, vid) VALUES (?, ?)').bind(day, vid).run();
    const isNew = first.meta && first.meta.changes === 1 ? 1 : 0;
    const batch = [
      env.DB.prepare('INSERT INTO views (day, path, n) VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET n = n + 1').bind(day, path.slice(0, 120)),
      env.DB.prepare('INSERT INTO daily (day, views, visitors) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors').bind(day, isNew),
    ];
    if (isNew) {
      const tally = env.DB.prepare('INSERT INTO tally (day, kind, name, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, name) DO UPDATE SET n = n + 1');
      const country = (request.cf && request.cf.country) || '';
      batch.push(tally.bind(day, 'src', sourceOf(request, url)), tally.bind(day, 'dev', deviceOf(ua)));
      if (/^[A-Z]{2}$/.test(country)) batch.push(tally.bind(day, 'cc', country));
    }
    await env.DB.batch(batch);
    // the per-visitor scrambles are only needed for the day itself; clear old ones now and then
    if (Math.random() < 0.01) await env.DB.prepare('DELETE FROM uniq WHERE day < ?').bind(daysAgo(3)).run();
  } catch (e) {
    console.error('visit not counted', e && e.message);
  }
}

/** Everything the Visitors screen shows. */
export async function report(env, days = 30) {
  const empty = { ok: false, since: '', totals: {}, chart: [], pages: [], sources: [], devices: [], countries: [] };
  if (!env.DB) return empty;
  try {
    const from = daysAgo(days - 1);
    const week = daysAgo(6);
    const now = today();
    const yesterday = daysAgo(1);
    const [daily, all, pages, tally] = await env.DB.batch([
      env.DB.prepare('SELECT day, views, visitors FROM daily WHERE day >= ? ORDER BY day').bind(from),
      env.DB.prepare('SELECT MIN(day) AS since, SUM(views) AS views, SUM(visitors) AS visitors FROM daily'),
      env.DB.prepare('SELECT path, SUM(n) AS n FROM views WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 15').bind(from),
      env.DB.prepare('SELECT kind, name, SUM(n) AS n FROM tally WHERE day >= ? GROUP BY kind, name ORDER BY n DESC').bind(from),
    ]);
    const byDay = {};
    for (const r of daily.results) byDay[r.day] = r;
    const chart = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgo(i);
      chart.push({ day: d, views: (byDay[d] && byDay[d].views) || 0, visitors: (byDay[d] && byDay[d].visitors) || 0 });
    }
    const sum = (rows) => rows.reduce((a, r) => ({ views: a.views + r.views, visitors: a.visitors + r.visitors }), { views: 0, visitors: 0 });
    const pick = (kind) => tally.results.filter((r) => r.kind === kind).map((r) => ({ name: r.name, n: r.n }));
    const a = all.results[0] || {};
    return {
      ok: true,
      since: a.since || '',
      totals: {
        today: sum(chart.filter((r) => r.day === now)),
        yesterday: sum(chart.filter((r) => r.day === yesterday)),
        week: sum(chart.filter((r) => r.day >= week)),
        month: sum(chart),
        all: { views: a.views || 0, visitors: a.visitors || 0 },
      },
      chart,
      pages: pages.results.map((r) => ({ path: r.path, n: r.n })),
      sources: pick('src').slice(0, 12),
      devices: pick('dev'),
      countries: pick('cc').slice(0, 12),
    };
  } catch (e) {
    console.error('visitor report failed', e && e.message);
    return empty;
  }
}

/* ------------------------------ wrong-password counter ------------------------------ */
// One atomic statement, so ten guesses arriving together are counted as ten.
export async function strikes(env, key) {
  if (!env.DB) return 0;
  try {
    const r = await env.DB.prepare('SELECT n FROM ratelimit WHERE key = ? AND exp > ?').bind(key, Math.floor(Date.now() / 1000)).first();
    return (r && r.n) || 0;
  } catch (e) { return 0; }
}
export async function strike(env, key, windowSec) {
  if (!env.DB) return;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + windowSec;
  try {
    await env.DB.prepare(
      'INSERT INTO ratelimit (key, n, exp) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET ' +
      'n = CASE WHEN ratelimit.exp < ? THEN 1 ELSE ratelimit.n + 1 END, exp = CASE WHEN ratelimit.exp < ? THEN ? ELSE ratelimit.exp END'
    ).bind(key, exp, now, now, exp).run();
    if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM ratelimit WHERE exp < ?').bind(now).run();
  } catch (e) { /* the counter is a safeguard, not a gate */ }
}
