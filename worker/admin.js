/**
 * /admin — the owner's side of the website: change wording on any page, write the blog, see the visitors.
 *
 * One password (the ADMIN_PASSWORD secret), a signed cookie, nothing else. Every screen here is "noindex".
 */
import { DAY, esc, clean, secure, json, hmac, same, plain, field, cleanInline, cleanBlocks, slugify, kvJson, kvStrict, signedIn, sign, cookie, sameOrigin, assetText, pagePath } from './lib.js';
import { unitsFor, readSeo } from './pages.js';
import { AUDIENCES, getPost, postMeta, rebuildIndex, published, drafts } from './blog.js';
import { report, strikes, strike, today } from './stats.js';

export const ADMIN_VERSION = '1';
const LOGIN_TRIES = 8;
const SUPPORT = { label: 'bhwebs.com/support', href: 'https://bhwebs.com/support' };

const who = (request) => { const ip = request.headers.get('cf-connecting-ip') || 'unknown'; return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip; };

/* ------------------------------ the pages of the site ------------------------------ */
// Everything listed in sitemap.xml, plus the blog. A page added to the site later shows up here by itself
// once it is in the site map.
export async function sitePages(env, origin) {
  const paths = ['/'];
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/sitemap.xml', origin).toString()));
    if (r.ok) for (const m of (await r.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      try { const p = pagePath(new URL(m[1]).pathname); if (!paths.includes(p)) paths.push(p); } catch (e) { /* not a URL */ }
    }
  } catch (e) { /* the list still has the home page */ }
  if (!paths.includes('/blog')) paths.push('/blog');
  const pages = await Promise.all(paths.map(async (path) => {
    const html = await assetText(env, origin, path);
    if (!html) return null;
    const title = plain(readSeo(html).title);
    return { path, html, name: path === '/' ? 'Home page' : (title.split(/\s[—|–-]\s/)[0] || path) };
  }));
  return pages.filter(Boolean);
}

// The HTML file behind an address the owner is editing (articles are edited in the Blog screen, not here).
export async function sourceFor(env, origin, path) {
  if (!/^\/[a-z0-9/_-]*$/i.test(path) || path.includes('//') || path.startsWith('/blog/') || path.startsWith('/admin')) return null;
  const html = await assetText(env, origin, path);
  return html ? { html } : null;
}

export async function putEntry(env, key, entry) {
  const n = Object.keys(entry.t || {}).length;
  if (!n && !entry.seo) return env.CONTENT.delete(key);
  return env.CONTENT.put(key, JSON.stringify({ t: entry.t || {}, ...(entry.seo ? { seo: entry.seo } : {}), updated: Date.now() }));
}

/* ------------------------------ the look of the admin screens ------------------------------ */
const ADMIN_CSS = `
body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FAF6EC;color:#26382C}
a{color:#1E4230}
.top{background:#142E21;color:#C2D3C3;padding:12px 24px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center}
.top strong{color:#fff;margin-right:18px;font-family:Georgia,serif;font-size:18px;font-weight:600}
.top nav{display:inline}
.top nav a{color:#DCE6DA;text-decoration:none;margin-right:6px;padding:7px 12px;border-radius:999px;font-size:15px;display:inline-block}
.top nav a.on,.top nav a:hover{background:rgba(255,255,255,.14);color:#fff}
.top form{margin:0}.top button{color:#fff;background:none;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:6px 14px;font:inherit;font-size:14px;cursor:pointer}
main{max-width:960px;margin:0 auto;padding:30px 20px 90px}
h1{font:600 32px/1.2 Georgia,serif;margin:0 0 6px;color:#142E21}h2{font:600 22px/1.25 Georgia,serif;margin:34px 0 10px;color:#142E21}
.help{color:#5D6E60;margin:0 0 22px;max-width:48em}
.box{background:#fff;border:1px solid #E2D9C4;border-radius:14px;padding:20px 22px;margin:0 0 16px}
.meta{font-size:13.5px;color:#5D6E60;margin:0 0 8px}
.tag{display:inline-block;background:#F1E9D8;color:#7a4a1c;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;margin-right:8px}
.tag.live{background:#E7EDE4;color:#1E4230}
.who{font-weight:700;font-size:18px;margin:0}
.row{display:flex;flex-wrap:wrap;align-items:center}.row form{margin:0}.row>*{margin:0 8px 8px 0}
.act,button.act{font:inherit;font-size:14.5px;border:1px solid #26382C;background:#fff;border-radius:999px;padding:8px 17px;cursor:pointer;color:#26382C;text-decoration:none;display:inline-block;line-height:1.3}
.act.main{background:#C9702E;border-color:#C9702E;color:#fff;font-weight:700}
.act.del{border-color:#a4452e;color:#a4452e}
.act[disabled]{opacity:.5;cursor:default}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}
.cards a{display:block;background:#fff;border:1px solid #E2D9C4;border-top:3px solid #C9702E;border-radius:14px;padding:22px;text-decoration:none;color:#26382C}
.cards a:hover{box-shadow:0 12px 30px -18px rgba(20,46,33,.5)}
.cards b{display:block;font:600 21px/1.25 Georgia,serif;margin-bottom:6px;color:#142E21}.cards span{color:#5D6E60;font-size:15px}
label{display:block;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5D6E60;margin:18px 0 6px}
label small{font-weight:400;text-transform:none;letter-spacing:0;color:#5D6E60}
input[type=text],input[type=password],select,textarea{width:100%;box-sizing:border-box;font:inherit;padding:12px 14px;border:1px solid #8FAE94;border-radius:10px;background:#fff;color:#26382C}
textarea{min-height:90px;resize:vertical}
.rte-bar{display:flex;flex-wrap:wrap;border:1px solid #8FAE94;border-bottom:0;border-radius:10px 10px 0 0;background:#E7EDE4;padding:6px;position:sticky;top:0;z-index:2}
.rte-bar button{font:inherit;font-size:14px;background:#fff;border:1px solid #C2D3C3;border-radius:7px;padding:6px 11px;margin:3px;cursor:pointer;color:#26382C}
.rte{border:1px solid #8FAE94;border-radius:0 0 10px 10px;background:#fff;padding:18px 20px;min-height:340px;font:17px/1.75 Georgia,serif;outline:none}
.rte:focus{box-shadow:0 0 0 3px rgba(143,174,148,.4)}
.rte h2{font:600 26px/1.2 Georgia,serif;margin:1.2em 0 .4em}.rte h3{font:600 21px/1.25 Georgia,serif;margin:1.1em 0 .4em}
.rte blockquote{border-left:3px solid #C9702E;margin:1em 0;padding:.2em 0 .2em 1em;font-style:italic}
.status{display:inline-block;font-size:15px}.status.ok{color:#1E4230;font-weight:700}.status.err{color:#a4452e;font-weight:700}
.login{max-width:380px;margin:12vh auto;background:#fff;border:1px solid #E2D9C4;border-radius:16px;padding:32px}
.login button{width:100%;font:inherit;font-weight:700;background:#C9702E;color:#fff;border:0;border-radius:999px;padding:13px;cursor:pointer;margin-top:18px}
.err{color:#a4452e}.empty{color:#5D6E60;padding:30px 0;text-align:center}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin:0 0 18px}
.tile{background:#fff;border:1px solid #E2D9C4;border-radius:14px;padding:18px 20px}
.tile b{display:block;font:600 34px/1.1 Georgia,serif;color:#142E21}
.tile span{display:block;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5D6E60;margin-bottom:6px}
.tile small{color:#5D6E60;font-size:14px}
.chart{display:flex;align-items:flex-end;height:170px;padding:10px 0 0;border-bottom:1px solid #E2D9C4}
.chart i{flex:1 1 0;margin:0 2px;background:#8FAE94;border-radius:4px 4px 0 0;min-height:2px;display:block}
.chart i.today{background:#C9702E}
.chart i.none{background:#E2D9C4}
.axis{display:flex;justify-content:space-between;font-size:12.5px;color:#5D6E60;margin-top:6px}
table.list{width:100%;border-collapse:collapse;font-size:15px}
table.list td{padding:8px 4px;border-top:1px solid #EFE8D8;vertical-align:top}table.list tr:first-child td{border-top:0}
table.list td.n{text-align:right;font-weight:700;white-space:nowrap;width:5em}
table.list .bar{display:block;height:5px;border-radius:3px;background:#C2D3C3;margin-top:5px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:720px){.top{padding:10px 14px}.top nav a{padding:6px 9px;font-size:14px}main{padding:22px 16px 80px}.two{grid-template-columns:1fr}.chart i{margin:0 1px}}
`;
const html = (title, body) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Yancheinu</title><link rel="icon" type="image/svg+xml" href="/favicon.svg"><style>${ADMIN_CSS}</style></head>${body}</html>`, { headers: secure({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }) });

const NAV = [['/admin', 'Start'], ['/admin/pages', 'Pages'], ['/admin/blog', 'Blog'], ['/admin/visitors', 'Visitors']];
function shell(title, active, body, { page = '', data = null } = {}) {
  return html(title, `<body data-page="${esc(page)}"><div class="top"><div><strong>Yancheinu · website</strong><nav>${NAV.map(([href, label]) => `<a href="${href}"${href === active ? ' class="on"' : ''}>${label}</a>`).join('')}<a href="/" target="_blank" rel="noopener">View the website ↗</a></nav></div><form method="post" action="/admin/logout"><button>Sign out</button></form></div><main>${body}</main>${data ? `<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : ''}<script src="/assets/admin/admin.js?v=${ADMIN_VERSION}" defer></script></body>`);
}

async function readJson(request, max = 200000) {
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0 || length > max) return null;
  try { const v = await request.json(); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
}

/* ------------------------------ visitors ------------------------------ */
const num = (n) => Number(n || 0).toLocaleString('en-US');
const shortDay = (d) => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };
const longDay = (d) => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };
const pageName = (path) => (path === '/' ? 'Home page' : path.startsWith('/blog/') ? 'Article: ' + path.slice(6).replace(/-/g, ' ') : path.slice(1).replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
function countryName(code) { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch (e) { return code; } }

function tiles(r) {
  const t = r.totals;
  const tile = (label, v, note) => `<div class="tile"><span>${label}</span><b>${num(v.visitors)}</b><small>${num(v.views)} page ${v.views === 1 ? 'view' : 'views'}${note ? ' · ' + note : ''}</small></div>`;
  return `<div class="tiles">${tile('Today', t.today)}${tile('Yesterday', t.yesterday)}${tile('Last 7 days', t.week)}${tile('Last 30 days', t.month)}</div>`;
}
function chart(r) {
  const max = Math.max(1, ...r.chart.map((d) => d.visitors));
  const now = today();
  const bars = r.chart.map((d) => `<i class="${d.day === now ? 'today' : d.visitors ? '' : 'none'}" style="height:${Math.max(2, Math.round((d.visitors / max) * 100))}%" title="${esc(shortDay(d.day))}: ${num(d.visitors)} ${d.visitors === 1 ? 'visitor' : 'visitors'}, ${num(d.views)} page views"></i>`).join('');
  const first = r.chart[0];
  const mid = r.chart[Math.floor(r.chart.length / 2)];
  return `<div class="box"><p class="meta" style="margin:0">Visitors per day, last 30 days. The orange bar is today. Point at a bar to see the numbers.</p><div class="chart" role="img" aria-label="Visitors per day for the last 30 days">${bars}</div><div class="axis"><span>${esc(shortDay(first.day))}</span><span>${esc(shortDay(mid.day))}</span><span>Today</span></div></div>`;
}
function listBox(title, rows, name) {
  const max = Math.max(1, ...rows.map((x) => x.n));
  const body = rows.length ? `<table class="list">${rows.map((x) => `<tr><td>${name(x)}<span class="bar" style="width:${Math.max(3, Math.round((x.n / max) * 100))}%"></span></td><td class="n">${num(x.n)}</td></tr>`).join('')}</table>` : '<p class="meta" style="margin:0">Nothing counted yet.</p>';
  return `<div class="box"><p class="who" style="margin-bottom:8px">${title}</p>${body}</div>`;
}
async function visitorsPage(env) {
  const r = await report(env, 30);
  if (!r.ok) return shell('Visitors', '/admin/visitors', `<h1>Visitors</h1><p class="help err">The visitor counter could not be read just now. Please try again in a minute.</p>`, { page: 'visitors' });
  const since = r.since ? `Counting began on ${esc(longDay(r.since))}. Since then: <b>${num(r.totals.all.visitors)}</b> visitors and <b>${num(r.totals.all.views)}</b> page views.` : 'Counting has just begun — the first numbers appear as soon as someone visits.';
  return shell('Visitors', '/admin/visitors', `<h1>Visitors</h1>
    <p class="help">How many people looked at your website. A <b>visitor</b> is one person on one day (someone who comes back tomorrow is counted again tomorrow); a <b>page view</b> is each page they open. Search-engine robots and your own visits while signed in here are not counted.</p>
    ${tiles(r)}${chart(r)}
    <p class="help" style="margin-top:14px">${since}</p>
    <h2>Last 30 days in detail</h2>
    <div class="two">
      ${listBox('Most-read pages', r.pages, (x) => `<a href="${esc(x.path)}" target="_blank" rel="noopener">${esc(pageName(x.path))}</a>`)}
      ${listBox('Where visitors came from', r.sources, (x) => esc(x.name))}
      ${listBox('What they used', r.devices, (x) => esc(x.name))}
      ${listBox('Countries', r.countries, (x) => esc(countryName(x.name)))}
    </div>
    <p class="meta">Nothing personal is stored: no names, no addresses, no cookies. To see how an advertisement is doing, give it its own link ending in <b>?utm_source=</b> and a name, for example <b>yancheinu.com/kallahs?utm_source=kallah-ad</b> — it then appears by that name under "Where visitors came from".</p>`, { page: 'visitors' });
}

/* ------------------------------ screens ------------------------------ */
export async function admin(request, env, url) {
  const origin = url.origin;
  const path = url.pathname.replace(/\/$/, '') || '/admin';
  const post = request.method === 'POST';
  const help = `<a href="${SUPPORT.href}" target="_blank" rel="noopener">${SUPPORT.label}</a>`;
  const loginForm = (error) => html('Sign in', `<body><form class="login" method="post" action="/admin/login"><h1>Sign in</h1><p class="help">Edit your website, write for the blog and see your visitors.</p>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Sign in</button><p class="meta" style="margin:16px 0 0">Forgotten the password? Ask at ${help}.</p></form></body>`);

  if (post && !sameOrigin(request)) return json({ ok: false, message: 'This request did not come from the website.' }, 403);

  if (path === '/admin/login' && post) {
    if (!env.ADMIN_PASSWORD) return loginForm('The password has not been set yet.');
    // Only wrong passwords count, so signing in normally never locks the owner out. The site-wide ceiling is
    // high: it slows a flood down without letting a stranger keep her out with a few dozen wrong guesses.
    const ip = who(request);
    if ((await strikes(env, 'login:' + ip)) >= LOGIN_TRIES || (await strikes(env, 'login:all')) >= LOGIN_TRIES * 50) return loginForm('Too many wrong passwords. Please wait 15 minutes and try again.');
    const form = await request.formData();
    const given = await hmac('compare', String(form.get('password') || ''));
    const real = await hmac('compare', env.ADMIN_PASSWORD);
    if (!same(given, real)) {
      await strike(env, 'login:' + ip, 900);
      await strike(env, 'login:all', 900);
      return loginForm('That password is not correct.');
    }
    const until = Date.now() + 30 * DAY * 1000;
    return new Response(null, { status: 303, headers: secure({ location: '/admin', 'set-cookie': cookie(`${until}.${await sign(request, env, until)}`, 30 * DAY) }) });
  }
  if (!(await signedIn(request, env))) return post ? json({ ok: false, message: 'Please sign in again.' }, 401) : loginForm('');

  if (post) {
    try {
      return await adminAction(request, env, { path, origin });
    } catch (err) {
      console.error(JSON.stringify({ message: 'admin action failed', path, error: String((err && err.stack) || err) }));
      return json({ ok: false, message: 'The website could not reach its storage just now, so nothing was changed. Please try again in a minute.' }, 503);
    }
  }

  if (path === '/admin/visitors') return visitorsPage(env);

  if (path === '/admin/pages') {
    const pages = await sitePages(env, origin);
    const shared = (await kvJson(env, 'shared')) || {};
    const rows = await Promise.all(pages.map(async (p) => {
      const e = (await kvJson(env, 'page:' + p.path)) || {};
      const live = new Set(unitsFor(p.html).map((u) => u.key));
      const keys = Object.keys(e.t || {});
      const stale = keys.filter((k) => !live.has(k)).length;
      const n = keys.length - stale;
      const changed = [n ? `${n} text ${n === 1 ? 'change' : 'changes'}` : '', e.seo ? 'title or description changed' : '', stale ? `${stale} earlier ${stale === 1 ? 'change is' : 'changes are'} no longer shown (the page itself was rewritten since)` : ''].filter(Boolean).join(' · ');
      return `<div class="box"><div class="row" style="justify-content:space-between"><div><p class="who">${esc(p.name)}</p><p class="meta" style="margin:0">yancheinu.com${esc(p.path === '/' ? '' : p.path)}${changed ? ' · ' + changed : ''}</p></div><div class="row" style="margin:0"><a class="act main" href="${esc(p.path)}?edit=1">Open and edit</a>${keys.length || e.seo ? `<button class="act del" data-reset="${esc(p.path)}">Restore the original</button>` : ''}</div></div></div>`;
    }));
    const sharedN = Object.keys(shared.t || {}).length;
    const sharedRow = `<div class="box"><div class="row" style="justify-content:space-between"><div><p class="who">Menu and footer</p><p class="meta" style="margin:0">The same on every page — change it on any page and it changes everywhere${sharedN ? ` · ${sharedN} text ${sharedN === 1 ? 'change' : 'changes'}` : ''}</p></div><div class="row" style="margin:0"><a class="act main" href="/?edit=1">Open and edit</a>${sharedN ? '<button class="act del" data-reset="*shared*">Restore the original</button>' : ''}</div></div></div>`;
    return shell('Pages', '/admin/pages', `<h1>Pages</h1><p class="help">Open a page, press <b>Edit the text on this page</b>, then click any outlined sentence, heading or button and type. Press <b>Save changes</b> when you are done; visitors see it within about a minute.</p><p class="help">You can reword anything that is outlined. To add or remove a whole paragraph, bullet or section, to change a phone number, link or photo, or for anything about the design, send a request at ${help}. The questions for mothers and for shadchanim appear on the home page <i>and</i> on the Coaching &amp; Courses page — change both.</p><p class="status" id="status" role="status"></p>${rows.join('')}${sharedRow}`, { page: 'pages' });
  }

  if (path === '/admin/blog') {
    const index = await rebuildIndex(env);
    const rows = [...drafts(index), ...published(index)].map((p) => `<div class="box"><div class="row" style="justify-content:space-between"><div><p class="who">${esc(p.title)}</p><p class="meta" style="margin:0"><span class="tag${p.status === 'published' ? ' live' : ''}">${p.status === 'published' ? 'Published' : 'Draft'}</span>${esc(p.audience || '')}${p.published ? ' · published ' + esc(longDay(p.published)) : ''}</p></div><div class="row" style="margin:0"><a class="act main" href="/admin/blog/edit?slug=${encodeURIComponent(p.slug)}">Edit</a><a class="act" href="/blog/${esc(p.slug)}" target="_blank" rel="noopener">View</a></div></div></div>`).join('');
    return shell('Blog', '/admin/blog', `<h1>Blog</h1><p class="help">A <b>draft</b> is visible only to you while you are signed in. A <b>published</b> article appears on the Blog page for everyone and is added to the list Google reads. The word "Blog" appears in the website's menu by itself as soon as your first article is published.</p><p><a class="act main" href="/admin/blog/edit">Write a new article</a></p>${rows || '<p class="empty">No articles yet. Press "Write a new article" to begin.</p>'}`, { page: 'blog' });
  }

  if (path === '/admin/blog/edit') {
    const slug = url.searchParams.get('slug') || '';
    const stored = slug ? await getPost(env, slug) : null;
    if (slug && !stored) return new Response(null, { status: 303, headers: secure({ location: '/admin/blog' }) });
    const p = stored || { slug: '', title: '', audience: AUDIENCES[0], teaser: '', description: '', body: '', status: 'draft', published: '' };
    const live = p.status === 'published';
    const address = !p.slug ? 'The web address is made from the title.' : p.published ? `Web address: yancheinu.com/blog/${esc(p.slug)} (it stays the same even if you change the title)` : `Web address: yancheinu.com/blog/${esc(p.slug)} (it follows the title until you publish; after that it stays the same)`;
    return shell(p.slug ? 'Edit article' : 'New article', '/admin/blog', `<p><a href="/admin/blog">← All articles</a></p><h1>${p.slug ? 'Edit article' : 'New article'}</h1>
      <p class="meta"><span class="tag${live ? ' live' : ''}">${live ? 'Published' : 'Draft'}</span>${address}</p>
      <label for="f-title">Title</label><input type="text" id="f-title" maxlength="140" value="${esc(p.title)}">
      <label for="f-audience">Who is it for</label><select id="f-audience">${AUDIENCES.map((t) => `<option${t === p.audience ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <label for="f-teaser">Summary <small>– one or two lines, shown on the Blog page under the title</small></label><textarea id="f-teaser" maxlength="300" style="min-height:64px">${esc(p.teaser)}</textarea>
      <label id="l-body">Article</label>
      <div class="rte-bar" id="rte-bar"><button type="button" data-cmd="formatBlock" data-arg="h2">Heading</button><button type="button" data-cmd="formatBlock" data-arg="h3">Small heading</button><button type="button" data-cmd="formatBlock" data-arg="p">Normal text</button><button type="button" data-cmd="bold"><b>Bold</b></button><button type="button" data-cmd="italic"><i>Italic</i></button><button type="button" data-cmd="insertUnorderedList">• List</button><button type="button" data-cmd="insertOrderedList">1. List</button><button type="button" data-cmd="formatBlock" data-arg="blockquote">Quote</button><button type="button" data-cmd="link">Link</button><button type="button" data-cmd="unlink">Remove link</button></div>
      <div class="rte" id="f-body" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="l-body">${p.body}</div>
      <p class="meta" style="margin-top:8px">You can paste from Word or an email: headings, lists and bold are kept, the fonts and colours are not.</p>
      <label for="f-description">Google description <small>– optional. If empty, the summary is used.</small></label><textarea id="f-description" maxlength="320" style="min-height:64px">${esc(p.description)}</textarea>
      <p class="help" style="margin:22px 0 0">${live ? 'This article is public. "Save changes" updates it straight away.' : 'Save it as a draft, press View to see it exactly as visitors will, then Publish when you are happy with it.'}</p>
      <div class="row" style="margin-top:14px">${live ? '<button class="act main" data-action="save">Save changes</button><button class="act" data-action="unpublish">Take offline (back to draft)</button>' : `<button class="act main" data-action="save">Save as draft</button>${p.slug ? '<button class="act" data-action="publish">Publish</button>' : ''}`}${p.slug ? `<a class="act" href="/blog/${esc(p.slug)}" target="_blank" rel="noopener">View</a><button class="act del" data-action="delete">Delete</button>` : ''}<span class="status" id="status" role="status"></span></div>`, { page: 'post', data: { slug: p.slug } });
  }

  if (path === '/admin') {
    const r = await report(env, 30);
    return shell('Your website', '/admin', `<h1>Your website</h1><p class="help">Choose what you would like to do. You cannot break the design, and any page can be put back to how it was.</p>
    ${r.ok ? `<h2 style="margin-top:8px">Visitors</h2>${tiles(r)}<p class="meta"><a href="/admin/visitors">See the chart, the most-read pages and where visitors came from →</a></p>` : ''}
    <h2>Edit</h2>
    <div class="cards">
      <a href="/admin/pages"><b>Change the text on a page</b><span>Open any page, click a sentence and type.</span></a>
      <a href="/admin/blog"><b>Blog</b><span>Write, edit and publish articles.</span></a>
      <a href="/admin/visitors"><b>Visitors</b><span>How many people came, and what they read.</span></a>
    </div>
    <h2>How it works</h2>
    <div class="box"><ol style="margin:0;padding-left:1.2em">
      <li>While you are signed in, a dark bar appears at the bottom of every page of your website.</li>
      <li>To change wording: open the page, press "Edit the text on this page", click any outlined text, type, then press "Save changes".</li>
      <li>The menu and the footer are the same on every page: change them once, on any page.</li>
      <li>Blog: write a new article, save it as a draft, press View to check it, then Publish.</li>
      <li>Everything you save appears for visitors within about a minute.</li>
      <li>For a new section, a photo, a phone number or link, or a design change, send a request at ${help}.</li>
    </ol></div>`, { page: 'start' });
  }
  return new Response(null, { status: 303, headers: secure({ location: '/admin' }) });
}

/* ------------------------------ actions ------------------------------ */
// Everything that changes something. Reads here are strict: if storage cannot be read, nothing is written.
async function adminAction(request, env, { path, origin }) {
  if (path === '/admin/logout') return new Response(null, { status: 303, headers: secure({ location: '/admin', 'set-cookie': cookie('', 0) }) });

  const tooLong = Number(request.headers.get('content-length')) > 200000;
  const body = tooLong ? null : await readJson(request);
  if (!body) return json({ ok: false, message: tooLong ? 'That is too long to save in one piece. Please shorten it, or split it into two articles.' : 'Nothing was received. Please try again.' }, tooLong ? 413 : 400);

  if (path === '/admin/api/page-reset') {
    if (body.path === '*shared*') { await env.CONTENT.delete('shared'); return json({ ok: true }); }
    const target = pagePath(clean(body.path, 200));
    if (!(await sourceFor(env, origin, target))) return json({ ok: false, message: 'This page cannot be edited here.' }, 400);
    await env.CONTENT.delete('page:' + target);
    return json({ ok: true });
  }

  if (path === '/admin/api/page' || path === '/admin/api/seo') {
    const target = pagePath(clean(body.path, 200));
    const source = await sourceFor(env, origin, target);
    if (!source) return json({ ok: false, message: 'This page cannot be edited here.' }, 400);

    if (path.endsWith('/seo')) {
      const entry = (await kvStrict(env, 'page:' + target)) || {};
      const built = readSeo(source.html);
      const title = field(body.title, 120);
      const description = field(body.description, 320);
      entry.seo = {};
      if (title && title !== plain(built.title)) entry.seo.title = title;
      if (description && description !== plain(built.description)) entry.seo.description = description;
      if (!entry.seo.title && !entry.seo.description) delete entry.seo;
      await putEntry(env, 'page:' + target, entry);
      return json({ ok: true });
    }

    const known = new Set(unitsFor(source.html).map((u) => u.key));
    const changes = body.changes && typeof body.changes === 'object' ? body.changes : {};
    const mine = {};     // this page's own wording
    const everywhere = {}; // menu and footer
    let n = 0;
    for (const key of Object.keys(changes).slice(0, 400)) {
      if (!known.has(key)) continue;
      const own = key[0] === 'm';
      const value = changes[key] === null ? '' : cleanInline(changes[key]);
      // emptied text goes back to the original: an empty heading, button or bullet would be left standing on the page
      (own ? mine : everywhere)[key] = plain(value) ? value : null;
      n++;
    }
    if (!n) return json({ ok: false, message: 'Nothing to save.' }, 400);
    const apply = async (key, set) => {
      if (!Object.keys(set).length) return;
      const entry = (await kvStrict(env, key)) || {};
      entry.t = entry.t || {};
      for (const k of Object.keys(set)) { if (set[k] === null) delete entry.t[k]; else entry.t[k] = set[k]; }
      await putEntry(env, key, entry);
    };
    await apply('page:' + target, mine);
    await apply('shared', everywhere);
    return json({ ok: true });
  }

  if (path === '/admin/api/post' || path === '/admin/api/post-delete') {
    const original = String(body.original || '');
    if (original && !/^[a-z0-9-]{1,80}$/.test(original)) return json({ ok: false, message: 'That article no longer exists.' }, 404);
    const cur = original ? await kvStrict(env, 'post:' + original) : null;
    if (original && !cur) return json({ ok: false, message: 'That article no longer exists.' }, 404);
    const index = (await kvStrict(env, 'posts:index')) || { items: [] };
    if (path.endsWith('/post-delete')) {
      await env.CONTENT.delete('post:' + original);
      await env.CONTENT.put('posts:index', JSON.stringify({ items: index.items.filter((p) => p.slug !== original) }));
      return json({ ok: true });
    }
    const title = field(body.title, 140);
    if (!title) return json({ ok: false, message: 'Please give the article a title.' }, 422);
    if (String(body.body || '').length > 120000) return json({ ok: false, message: 'This article is too long to save in one piece. Please shorten it, or split it into two articles.' }, 413);
    const action = String(body.action || 'save');
    const status = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : (cur && cur.status) || 'draft';
    const day = today();
    const next = {
      slug: cur ? cur.slug : '',
      title,
      audience: AUDIENCES.includes(body.audience) ? body.audience : AUDIENCES[0],
      teaser: field(body.teaser, 300),
      description: field(body.description, 320),
      body: cleanBlocks(body.body),
      status,
      published: (cur && cur.published) || (status === 'published' ? day : ''),
      updated: day,
    };
    if (status === 'published' && (!next.teaser || !plain(next.body))) return json({ ok: false, message: 'Please add a summary and the article text before publishing.' }, 422);
    // the web address follows the title until the article has been published once; after that it never changes
    if (!cur || !cur.published) {
      const first = slugify(title) || 'article';
      let slug = first;
      let n = 2;
      while (slug !== (cur && cur.slug) && (index.items.some((p) => p.slug === slug) || (await kvStrict(env, 'post:' + slug)))) slug = `${first}-${n++}`;
      next.slug = slug;
    }
    await env.CONTENT.put('post:' + next.slug, JSON.stringify(next));
    if (cur && cur.slug !== next.slug) await env.CONTENT.delete('post:' + cur.slug);
    const items = index.items.filter((p) => p.slug !== next.slug && p.slug !== (cur && cur.slug));
    items.push(postMeta(next));
    await env.CONTENT.put('posts:index', JSON.stringify({ items }));
    return json({ ok: true, slug: next.slug, status });
  }
  return json({ ok: false, message: 'Unknown action.' }, 404);
}
