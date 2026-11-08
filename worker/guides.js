/**
 * Free guides written in /admin → Free Guides (added Nov 2026, so Mrs. Eisenbach can publish a guide herself).
 * Like the blog, they live in the site's storage (KV), not in the HTML files:
 *   guide:<slug>     one guide          guides:index    the list          guidepdf:<slug>   its PDF download
 *
 * guides.html is the Free Guides page. Guides written in /admin are poured in between its
 * <!-- guides --> and <!-- /guides --> markers, ahead of the two guides that were built as pages of their own
 * (calm-before-a-meeting.html, support-without-taking-over.html). A guide's own page, /guides/<slug>, is
 * guides.html with the inside of <main> swapped, so its menu and footer always match the rest of the site.
 *
 * The PDF download is made by Cloudflare Browser Rendering: the guide's own page, printed with the site's print
 * styles — the same way the first two guides' PDFs were made with Chrome by hand.
 */
import { esc, plain, kvJson } from './lib.js';
import { audienceOf } from './blog.js';

const SITE = 'https://yancheinu.com';
const DL = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></svg>';

export const getGuide = (env, slug) => kvJson(env, 'guide:' + slug);
export const guideMeta = (g) => ({ slug: g.slug, title: g.title, audience: g.audience, intro: g.intro, status: g.status, published: g.published || '', updated: g.updated || '', pdfAt: g.pdfAt || 0 });
export const getGuideIndex = async (env) => (await kvJson(env, 'guides:index')) || { items: [] };
// rebuilt from the guides themselves whenever the owner opens the Free Guides screen, so it can always be repaired
export async function rebuildGuideIndex(env) {
  const keys = [];
  let cursor;
  do {
    const batch = await env.CONTENT.list({ prefix: 'guide:', limit: 1000, cursor });
    keys.push(...batch.keys);
    cursor = batch.list_complete ? undefined : batch.cursor;
  } while (cursor);
  const guides = (await Promise.all(keys.map((k) => env.CONTENT.get(k.name, 'json')))).filter((g) => g && g.slug);
  const index = { items: guides.map(guideMeta) };
  await env.CONTENT.put('guides:index', JSON.stringify(index));
  return index;
}
const byNewest = (a, b) => String(b.published || '').localeCompare(String(a.published || '')) || String(a.title).localeCompare(String(b.title));
export const liveGuides = (index) => index.items.filter((g) => g.status === 'published').sort(byNewest);
export const draftGuides = (index) => index.items.filter((g) => g.status !== 'published').sort((a, b) => String(a.title).localeCompare(String(b.title)));
const pdfHref = (g) => `/guides/${g.slug}.pdf${g.pdfAt ? '?v=' + g.pdfAt : ''}`;

/* ------------------------------ checklists ------------------------------ */
// A guide pasted from Word often has lines that start with ☐. Those become a real checklist: one square box
// per line, on the page and in the PDF. The editor's "☐ Checklist" button makes the same list.
const BOX = /^(?:\s|&nbsp;)*[☐☑☒□▢❏❑]\s*(?:&nbsp;)*\s*/;
export function makeChecklists(html) {
  // browsers sometimes put a new list inside the paragraph it was made from; a list is never inside a paragraph
  let out = String(html || '').replace(/<p>\s*(<(ul|ol|blockquote|h2|h3)\b[^>]*>[\s\S]*?<\/\2>)\s*<\/p>/g, '$1');
  // a list whose items start with a box
  out = out.replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/g, (m, tag, inner) => {
    const items = inner.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || [];
    if (!items.length || !items.every((li) => BOX.test(li.replace(/^<li\b[^>]*>/, '')))) return m;
    return `<ul class="checklist">${items.map((li) => li.replace(/^(<li\b[^>]*>)/, '<li>').replace(/^<li>\s*(?:&nbsp;|\s)*[☐☑☒□▢❏❑]\s*(?:&nbsp;)*\s*/, '<li>')).join('')}</ul>`;
  });
  // paragraphs in a row that each start with a box
  out = out.replace(/(?:<p\b[^>]*>(?:\s|&nbsp;)*[☐☑☒□▢❏❑][\s\S]*?<\/p>\s*)+/g, (run) => {
    const items = run.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || [];
    return `<ul class="checklist">${items.map((p) => '<li>' + p.replace(/^<p\b[^>]*>/, '').replace(/<\/p>$/, '').replace(BOX, '') + '</li>').join('')}</ul>`;
  });
  return out;
}

/* ------------------------------ the Free Guides page ------------------------------ */
function card(g, admin) {
  const live = g.status === 'published';
  return `<div class="card guide-card" data-noedit>
        <span class="eyebrow">Free guide &middot; ${esc(audienceOf(g.audience))}</span>${admin && !live ? '<span class="post-card__draft">Draft &ndash; only you can see this</span>' : ''}
        <h3><a href="/guides/${esc(g.slug)}">${esc(g.title)}</a></h3>
        <p>${esc(g.intro || '')}</p>
        <div class="hero__actions">
          <a class="btn" href="/guides/${esc(g.slug)}">Read the guide</a>
          ${live ? `<a class="btn btn--ghost" href="${esc(pdfHref(g))}" download>${DL} Download (PDF)</a>` : ''}
        </div>
      </div>`;
}

/** guides.html with the guides written in /admin poured in, newest first, ahead of the two built-in ones. */
export function fillGuides(html, index, admin) {
  const list = admin ? [...draftGuides(index), ...liveGuides(index)] : liveGuides(index);
  if (!list.length) return html;
  return html.replace(/(<!--\s*guides\b[^>]*-->)[\s\S]*?(<!--\s*\/guides\s*-->)/, (m, open, close) => `${open}\n      ${list.map((g) => card(g, admin)).join('\n      ')}\n      ${close}`);
}

/* ------------------------------ one guide ------------------------------ */
/** One guide, wearing guides.html's header, footer and closing invitation. `base` is where its relative links start. */
export function guidePage(shell, g, { admin = false, base = '/' } = {}) {
  const live = g.status === 'published';
  const url = `${SITE}/guides/${g.slug}`;
  const who = audienceOf(g.audience);
  const title = `${g.title} — A Free Guide | Yancheinu`;
  const desc = g.intro || plain(g.body).slice(0, 200);
  const download = (label) => `<a class="btn btn--autumn" href="${esc(pdfHref(g))}" download>
        ${DL}
        ${label}
      </a>`;
  const ld = live ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: desc, url, mainEntityOfPage: url,
    datePublished: g.published, dateModified: g.updated || g.published, inLanguage: 'en', image: `${SITE}/assets/img/road-hero.jpg`,
    author: { '@type': 'Person', name: 'Mrs. Simy Eisenbach' },
    publisher: { '@type': 'Organization', name: 'Yancheinu', url: `${SITE}/` },
  }).replace(/</g, '\\u003c')}</script>\n` : '';
  const cta = (shell.match(/<section class="cta">[\s\S]*?<\/section>/) || [''])[0];

  const main = `

<!-- printed handout header (hidden on screen) -->
<div class="print-brand" aria-hidden="true">
  <img src="assets/img/pin-forest.png" alt="">
  <span><strong>Yancheinu</strong>Shidduch &amp; Life Coaching &middot; Mrs. Eisenbach</span>
</div>

<section class="pagehero" data-noedit>
  <div class="pagehero__bg" style="background-image:url('assets/img/hero-services.webp')" aria-hidden="true"></div>
  <div class="pagehero__scrim" aria-hidden="true"></div>
  <div class="wrap reveal in">
    <span class="eyebrow" style="justify-content:center">Free bonus guide &middot; ${esc(who)}</span>
    <h1>${esc(g.title)}</h1>
    ${g.intro ? `<p>${esc(g.intro)}</p>` : ''}
    ${live ? `<div class="hero__actions" style="justify-content:center">
      ${download('Download the Guide &mdash; free')}
    </div>
    <span class="hero__note" style="display:block;margin-top:18px">Yours to keep &mdash; save it, print it, or pass it along.</span>` : ''}
  </div>
</section>

<section class="section" data-noedit>
  <div class="wrap wrap--narrow">
    ${live || !admin ? '' : '<p class="draftnote print-hide">Draft &ndash; only you can see this guide, because you are signed in. Publish it when you are happy with it.</p>'}
    <article class="post guide-body">
${g.body || ''}
    </article>
  </div>
</section>

<section class="section print-hide" data-noedit>
  <div class="wrap">
    <div class="statement">
      <div class="hero__actions" style="justify-content:center;margin-top:0">
        ${live ? download('Download this guide &mdash; free') : ''}
        <a class="btn btn--ghost" href="guides.html">More free guides</a>
      </div>
    </div>
  </div>
</section>

<!-- printed handout footer (hidden on screen) -->
<div class="print-foot" aria-hidden="true">
  Yancheinu &middot; Mrs. Eisenbach &middot; Call/Text 347-766-2269 &middot; 718-926-4773 &middot; yancheinucoaching@gmail.com &middot; yancheinu.com
</div>

${cta}
`;
  let out = shell.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, (m, open, close) => open + main + close);
  const head = (pattern, value) => { out = out.replace(pattern, (m, a, b) => a + value + b); };
  head(/(<title[^>]*>)[\s\S]*?(<\/title>)/i, esc(title));
  head(/(<meta\s+name="description"\s+content=")[^"]*(")/i, esc(desc));
  head(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, esc(g.title));
  head(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, esc(desc));
  head(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, url);
  head(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, url);
  out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/i, '');
  // the page lives one level down (/guides/…), so the site's relative links need a starting point
  out = out.replace(/<head>/i, `<head>\n<base href="${esc(base)}">${live ? '' : '\n<meta name="robots" content="noindex, nofollow">'}`);
  return out.replace(/<\/head>/i, ld + '</head>');
}

/* ------------------------------ the PDF ------------------------------ */
/**
 * Print a guide to PDF with Cloudflare Browser Rendering and keep it in storage. Never throws.
 * `origin` is where the browser fetches the site's styles, fonts and pictures from; a computer's own test copy
 * (http://127.0.0.1…) cannot be reached from Cloudflare, so it borrows the live site's.
 */
export async function makeGuidePdf(env, shell, g, origin) {
  if (!env.BROWSER) return { ok: false, note: 'PDF making is not connected on this copy of the website' };
  const base = /^https:\/\//.test(origin) ? origin + '/' : SITE + '/';
  const html = guidePage(shell, { ...g, status: 'published' }, { base });
  let browser;
  try {
    // loaded only here, so ordinary page views never spend time starting the browser library
    const { default: puppeteer } = await import('@cloudflare/puppeteer');
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const pdf = await page.pdf({ format: 'letter', printBackground: true, preferCSSPageSize: true });
    const at = Date.now();
    await env.CONTENT.put('guidepdf:' + g.slug, pdf, { metadata: { at, bytes: pdf.byteLength } });
    return { ok: true, at };
  } catch (e) {
    console.error(JSON.stringify({ message: 'guide PDF failed', slug: g.slug, error: String((e && e.stack) || e) }));
    return { ok: false, note: String((e && e.message) || e).slice(0, 200) };
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* already gone */ } }
  }
}

/** GET /guides/<slug>.pdf — the stored PDF of a published guide (made on the spot if it is missing). */
export async function serveGuidePdf(env, url, slug, shellFor) {
  const g = await getGuide(env, slug);
  if (!g || g.status !== 'published') return null;
  let pdf = await env.CONTENT.get('guidepdf:' + slug, { type: 'arrayBuffer' });
  if (!pdf) {
    const made = await makeGuidePdf(env, await shellFor(), g, url.origin);
    if (made.ok) {
      pdf = await env.CONTENT.get('guidepdf:' + slug, { type: 'arrayBuffer' });
      // note it on the guide too, so /admin → Free Guides shows the download as ready
      try {
        g.pdfAt = made.at;
        await env.CONTENT.put('guide:' + slug, JSON.stringify(g));
        const index = await getGuideIndex(env);
        await env.CONTENT.put('guides:index', JSON.stringify({ items: [...index.items.filter((x) => x.slug !== slug), guideMeta(g)] }));
      } catch (e) { /* the PDF itself is stored */ }
    }
  }
  if (!pdf) return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download being prepared</title><p style="font:18px/1.6 Georgia,serif;max-width:34em;margin:12vh auto;padding:0 20px">This download is being prepared. Please try again in a few minutes, or <a href="/guides/${esc(slug)}">read the guide on its page</a>.</p>`, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '120' } });
  const name = 'Yancheinu - ' + plain(g.title).replace(/[^\w ’'.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) + '.pdf';
  return new Response(pdf, { headers: {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${name.replace(/["’]/g, "'")}"`,
    'cache-control': 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  } });
}

/** Published guides added to the site map that search engines read. */
export function guidesInSitemap(xml, index) {
  const rows = liveGuides(index).map((g) => `  <url><loc>${SITE}/guides/${esc(g.slug)}</loc><lastmod>${esc(g.updated || g.published)}</lastmod></url>`);
  return rows.length ? xml.replace('</urlset>', () => rows.join('\n') + '\n</urlset>') : xml;
}

/** One line for the chat, so it can name the guides written in /admin too. */
export const guidesForChat = (index) => liveGuides(index).map((g) => `"${plain(g.title)}" (${audienceOf(g.audience).toLowerCase()})`).join('; ');
