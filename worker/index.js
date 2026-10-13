/**
 * Yancheinu — the Worker in front of the website.
 *
 * The pages themselves are plain HTML files in this repository. This Worker serves them and adds four things:
 *   /api/chat   the receptionist chat                              (chat.js)
 *   /admin      the owner's screens: wording, blog, visitors       (admin.js)
 *   /blog/…     articles written in /admin                         (blog.js)
 *   and, on every page, the wording the owner saved in /admin      (pages.js) plus the visitor count (stats.js)
 *
 * Images, CSS and scripts under /assets/ never come through here (see run_worker_first in wrangler.jsonc).
 * If anything in the page handling goes wrong, the plain HTML file is served instead: the site stays up.
 */
import { handleChat } from './chat.js';
import { admin, ADMIN_VERSION } from './admin.js';
import { esc, kvJson, signedIn, pagePath, assetText } from './lib.js';
import { unitsFor, render, applySeo } from './pages.js';
import { getPost, getIndex, published, fillIndex, postPage, sitemapWith } from './blog.js';
import { countable, record } from './stats.js';

const BLOG_LINK = /<li\b[^>]*\sdata-blog-link\b[^>]*>[\s\S]*?<\/li>\s*/g;

function pageHeaders(env, owner) {
  const h = new Headers({
    'content-type': 'text/html; charset=utf-8',
    // always ask the server: the owner's edits and new articles must show without a hard refresh
    'cache-control': owner ? 'private, no-store' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
  });
  if (env.PREVIEW) h.set('x-robots-tag', 'noindex, nofollow');
  return h;
}

const two = (long, short) => `<span class="yn-l">${long}</span><span class="yn-s">${short}</span>`;
function adminBar({ path, post }) {
  const tools = post
    ? `<a class="yn-btn yn-btn--main" href="/admin/blog/edit?slug=${encodeURIComponent(post.slug)}">${two('Edit this article', 'Edit article')}</a>`
    : `<button type="button" class="yn-btn yn-btn--main" data-yn="edit">${two('Edit the text on this page', 'Edit text')}</button><button type="button" class="yn-btn" data-yn="seo">${two('Page title &amp; Google description', 'Title')}</button>`;
  return `<div id="yn-bar" dir="ltr" lang="en" data-path="${esc(path)}" data-noedit><span class="yn-bar__who">You are signed in</span>${tools}<a class="yn-btn" href="/admin">${two('All editing tools', 'Tools')}</a><span class="yn-bar__status" role="status" aria-live="polite"></span></div>
<link rel="stylesheet" href="/assets/admin/editor.css?v=${ADMIN_VERSION}"><script src="/assets/admin/editor.js?v=${ADMIN_VERSION}" defer></script>
`;
}

// A friendly "not here" page wearing the site's own header and footer.
async function notFound(env, url, owner) {
  const shell = await assetText(env, url.origin, '/blog');
  if (!shell) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const body = `
<section class="section" style="padding-top:150px" data-noedit>
  <div class="wrap wrap--narrow center">
    <span class="eyebrow" style="justify-content:center">Page not found</span>
    <h1 style="font-size:clamp(2rem,4vw,2.8rem)">This page took a different road.</h1>
    <p style="margin-top:16px">The page you were looking for is not here. It may have moved, or the address may have a small typo.</p>
    <div class="hero__actions" style="justify-content:center"><a class="btn" href="/">Back to the home page</a><a class="btn btn--ghost" href="/contact">Contact Mrs. Eisenbach</a></div>
  </div>
</section>
`;
  let out = shell.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, (m, a, b) => a + body + b)
    .replace(/(<title[^>]*>)[\s\S]*?(<\/title>)/i, (m, a, b) => a + 'Page not found | Yancheinu' + b)
    .replace(/<head>/i, '<head>\n<base href="/">\n<meta name="robots" content="noindex">');
  const shared = (await kvJson(env, 'shared')) || {};
  out = render(out, unitsFor(out), shared.t || {}, false);
  if (!published(await getIndex(env)).length) out = out.replace(BLOG_LINK, '');
  const h = pageHeaders(env, owner);
  h.set('x-robots-tag', 'noindex');
  return new Response(out, { status: 404, headers: h });
}

async function servePage(request, env, ctx, url) {
  const origin = url.origin;
  const path = url.pathname;
  if (/\/\/|\\|%2f|%5c/i.test(path)) return env.ASSETS.fetch(request);   // never a real page

  const owner = await signedIn(request, env);
  const article = /^\/blog\/([a-z0-9-]+)(\/?)$/.exec(path);
  let html;
  let key;
  let post = null;
  let index = null;

  if (article) {
    post = await getPost(env, article[1]);
    if (!post || (post.status !== 'published' && !owner)) return notFound(env, url, owner);
    if (article[2]) return new Response(null, { status: 301, headers: { location: `${origin}/blog/${post.slug}` } });
    const shell = await assetText(env, origin, '/blog');
    if (!shell) return notFound(env, url, owner);
    index = await getIndex(env);
    html = postPage(shell, post, index, owner);
    key = '/blog';
  } else {
    // the page as written, always in full: its own ETag knows nothing about the owner's edits
    const headers = new Headers(request.headers);
    headers.delete('if-none-match');
    headers.delete('if-modified-since');
    // redirect: 'manual' lets "/about.html" → "/about" reach the visitor instead of being followed here
    const res = await env.ASSETS.fetch(new Request(url.toString(), { headers, redirect: 'manual' }));
    if (res.status === 404 && !/\.[a-z0-9]{2,5}$/i.test(path)) return notFound(env, url, owner);
    if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    html = await res.text();
    key = pagePath(path);
  }

  const [page, shared, list] = await Promise.all([kvJson(env, 'page:' + key), kvJson(env, 'shared'), index || getIndex(env)]);
  const hasPosts = published(list).length > 0;
  if (key === '/blog' && !post) html = fillIndex(html, list, owner);

  const wording = { ...((shared && shared.t) || {}), ...((page && page.t) || {}) };
  let out = render(html, unitsFor(html), wording, owner && !post);
  if (!post) out = applySeo(out, page && page.seo);
  // the word "Blog" joins the menu only once there is something to read
  if (!hasPosts && !owner) out = out.replace(BLOG_LINK, '');
  if (owner) out = out.replace(/<\/body>/i, () => adminBar({ path: key, post }) + '</body>');
  else if (countable(request)) ctx.waitUntil(record(request, env, post ? '/blog/' + post.slug : key));

  return new Response(request.method === 'HEAD' ? null : out, { status: 200, headers: pageHeaders(env, owner) });
}

async function sitemap(env, url) {
  const res = await env.ASSETS.fetch(new Request(url.toString()));
  if (!res.ok) return res;
  const h = new Headers({ 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-cache' });
  if (env.PREVIEW) h.set('x-robots-tag', 'noindex, nofollow');
  return new Response(sitemapWith(await res.text(), await getIndex(env)), { status: 200, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/chat') return handleChat(request, env);

    const inAdmin = path === '/admin' || path.startsWith('/admin/');
    try {
      if (inAdmin) return await admin(request, env, url);
      const reading = request.method === 'GET' || request.method === 'HEAD';
      if (reading && path === '/sitemap.xml') return await sitemap(env, url);
      // a page is an address without a file ending; everything else is a file and goes straight through
      if (reading && !/\.[a-zA-Z0-9]{2,5}$/.test(path)) return await servePage(request, env, ctx, url);
    } catch (err) {
      console.error(JSON.stringify({ message: 'page handling failed', path, error: String((err && err.stack) || err) }));
      if (inAdmin) return new Response('The editing screen hit a problem. Nothing was changed. Please try again in a minute.', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
