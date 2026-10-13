/**
 * The blog. Articles are written in /admin and kept in the site's storage (KV), not in the HTML files.
 *
 * blog.html is an ordinary page of the site and doubles as the frame for every article: the list of
 * articles is poured into its [data-posts] box, and an article page is the same file with the inside of
 * <main> swapped. So the menu and footer of the blog always match the rest of the site.
 */
import { esc, plain, kvJson } from './lib.js';

export const AUDIENCES = ['For everyone', 'For mothers', 'For singles', 'For kallahs', 'For shadchanim'];
const SITE = 'https://yancheinu.com';

// Every article has its OWN key, so saving one can never overwrite another. (KV reads can be up to a minute
// stale; with one shared value a second save could silently undo the first.)
export const getPost = (env, slug) => kvJson(env, 'post:' + slug);
export const postMeta = (p) => ({ slug: p.slug, title: p.title, audience: p.audience, teaser: p.teaser, status: p.status, published: p.published || '', updated: p.updated || '' });
export const getIndex = async (env) => (await kvJson(env, 'posts:index')) || { items: [] };
// The list is derived from the articles themselves and rebuilt whenever the owner opens the Blog screen,
// so it can always be repaired.
export async function rebuildIndex(env) {
  const keys = [];
  let cursor;
  do {
    const batch = await env.CONTENT.list({ prefix: 'post:', limit: 1000, cursor });
    keys.push(...batch.keys);
    cursor = batch.list_complete ? undefined : batch.cursor;
  } while (cursor);
  const posts = (await Promise.all(keys.map((k) => env.CONTENT.get(k.name, 'json')))).filter((p) => p && p.slug);
  const index = { items: posts.map(postMeta) };
  await env.CONTENT.put('posts:index', JSON.stringify(index));
  return index;
}
const byNewest = (a, b) => String(b.published || '').localeCompare(String(a.published || '')) || String(a.title).localeCompare(String(b.title));
export const published = (index) => index.items.filter((p) => p.status === 'published').sort(byNewest);
export const drafts = (index) => index.items.filter((p) => p.status !== 'published').sort((a, b) => String(a.title).localeCompare(String(b.title)));

// "October 12, 2026" from a YYYY-MM-DD stamp
export const fmtDate = (d) => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };

const ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const card = (p, admin) => `<article class="card post-card">
        <span class="post-card__tag">${esc(p.audience || AUDIENCES[0])}</span>${admin && p.status !== 'published' ? '<span class="post-card__draft">Draft &ndash; only you can see this</span>' : ''}
        <h3><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h3>
        ${p.status === 'published' && p.published ? `<p class="post-card__date"><time datetime="${esc(p.published)}">${fmtDate(p.published)}</time></p>` : ''}
        <p>${esc(p.teaser || '')}</p>
        <a class="more" href="/blog/${esc(p.slug)}">Read the article ${ARROW}</a>
      </article>`;

/** blog.html with the list of articles poured in. With no articles the page keeps its own "coming soon" note. */
export function fillIndex(html, index, admin) {
  const list = admin ? [...drafts(index), ...published(index)] : published(index);
  if (!list.length) return html;
  return html
    .replace(/(<div\b[^>]*\sdata-posts\b[^>]*>)[\s\S]*?(<\/div>\s*<!--\s*\/posts\s*-->)/, (m, open, close) => `${open}\n      ${list.map((p) => card(p, admin)).join('\n      ')}\n    ${close}`)
    .replace(/<p\b[^>]*\sdata-blog-empty\b[^>]*>[\s\S]*?<\/p>\s*/, '');
}

/** One article, wearing blog.html's header and footer. */
export function postPage(shell, post, index, admin) {
  const live = post.status === 'published';
  const url = `${SITE}/blog/${post.slug}`;
  const title = post.title.length > 48 ? post.title : `${post.title} | Yancheinu`;
  const desc = post.description || post.teaser || '';
  const others = published(index).filter((p) => p.slug !== post.slug);
  const related = [...others.filter((p) => p.audience === post.audience), ...others.filter((p) => p.audience !== post.audience)].slice(0, 3);

  const ld = live ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: desc, url,
    mainEntityOfPage: url, datePublished: post.published, dateModified: post.updated || post.published, inLanguage: 'en',
    image: `${SITE}/assets/img/road-hero.jpg`,
    author: { '@type': 'Person', name: 'Mrs. Simy Eisenbach', jobTitle: 'ICF Certified Professional Coach', url: `${SITE}/about` },
    publisher: { '@type': 'Organization', name: 'Yancheinu', url: `${SITE}/` },
  }).replace(/</g, '\\u003c')}</script>\n` : '';

  const main = `
<section class="pagehero pagehero--post" data-noedit>
  <div class="pagehero__bg" style="background-image:url('assets/img/hero-about.webp')" aria-hidden="true"></div>
  <div class="pagehero__scrim" aria-hidden="true"></div>
  <div class="wrap">
    <div class="reveal in">
      <span class="eyebrow" style="justify-content:center">${esc(post.audience || AUDIENCES[0])}</span>
      <h1>${esc(post.title)}</h1>
      ${live && post.published ? `<p class="post-meta">By Mrs. Simy Eisenbach &middot; <time datetime="${esc(post.published)}">${fmtDate(post.published)}</time></p>` : '<p class="post-meta">By Mrs. Simy Eisenbach</p>'}
    </div>
  </div>
</section>

<section class="section" data-noedit>
  <div class="wrap wrap--narrow">
    ${live ? '' : '<p class="draftnote">Draft &ndash; only you can see this article, because you are signed in. Publish it when you are happy with it.</p>'}
    <article class="post">
${post.body || ''}
    </article>
    <p class="post-back"><a href="/blog">&larr; All articles</a></p>
  </div>
</section>
${related.length ? `
<section class="section section--mist" data-noedit>
  <div class="wrap">
    <div class="section__head reveal in"><h2>More from the blog</h2></div>
    <div class="grid grid--3 blog-list">
      ${related.map((p) => card(p, false)).join('\n      ')}
    </div>
  </div>
</section>` : ''}
`;

  // the closing invitation at the bottom of blog.html is kept: only what sits before it is swapped
  let out = shell.replace(/(<main\b[^>]*>)[\s\S]*?(<!--\s*post-keep\s*-->|<\/main>)/i, (m, open, keep) => open + main + keep);
  const head = (pattern, value) => { out = out.replace(pattern, (m, a, b) => a + value + b); };
  head(/(<title[^>]*>)[\s\S]*?(<\/title>)/i, esc(title));
  head(/(<meta\s+name="description"\s+content=")[^"]*(")/i, esc(desc));
  head(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, esc(post.title));
  head(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, esc(desc));
  head(/(<meta\s+property="og:type"\s+content=")[^"]*(")/i, 'article');
  head(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, url);
  head(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, url);
  // the page lives one level down (/blog/…), so the site's relative links need a starting point
  out = out.replace(/<head>/i, `<head>\n<base href="/">${live ? '' : '\n<meta name="robots" content="noindex, nofollow">'}`);
  return out.replace(/<\/head>/i, ld + '</head>');
}

/** Published articles added to the site map that search engines read. */
export function sitemapWith(xml, index) {
  const live = published(index);
  if (!live.length) return xml;
  const rows = [`  <url><loc>${SITE}/blog</loc><lastmod>${esc(live[0].updated || live[0].published)}</lastmod></url>`]
    .concat(live.map((p) => `  <url><loc>${SITE}/blog/${esc(p.slug)}</loc><lastmod>${esc(p.updated || p.published)}</lastmod></url>`));
  return xml.replace('</urlset>', () => rows.join('\n') + '\n</urlset>');
}

export const teaserFrom = (body) => plain(body).slice(0, 200);
