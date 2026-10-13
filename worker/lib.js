/**
 * Small helpers shared by the Worker's modules.
 */

export const DAY = 86400;
const enc = new TextEncoder();

export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

// referrer-policy must not be "no-referrer" on the admin screens: with it, browsers send "Origin: null" on the
// admin forms and every sign-in would be rejected by the same-origin check.
export const secure = (headers = {}) => ({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin', 'x-robots-tag': 'noindex, nofollow', ...headers });
export const json = (data, status = 200) => Response.json(data, { status, headers: secure({ 'cache-control': 'no-store' }) });

export async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// A short, stable fingerprint of a piece of text (cyrb53). Not for secrets — only to name a sentence.
export function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ------------------------------ text ------------------------------ */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', middot: '·', rarr: '→', copy: '©' };
const codePoint = (n) => (n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '');

// visible text of a fragment
export function plain(html) {
  return String(html == null ? '' : html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&#(\d+);/g, (m, n) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (Object.hasOwn(ENT, n) ? ENT[n] : m))
    .replace(/\s+/g, ' ')
    .trim();
}
export const field = (v, max) => plain(clean(v, max * 3)).slice(0, max);

const INLINE_TAGS = new Set(['a', 'strong', 'b', 'em', 'i', 'br', 'span', 'small', 'sup', 'sub', 'u', 'mark', 'cite', 'bdi']);
const BLOCK_TAGS = new Set([...INLINE_TAGS, 'p', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'div']);
const DIRS = new Set(['rtl', 'ltr', 'auto']);

// Whitelist sanitiser for what the editor sends back. Anything not listed is dropped (its text is kept).
// Only a handful of harmless attributes survive, and href must be an ordinary link.
export function sanitize(html, allowed) {
  const src = String(html == null ? '' : html).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|template|svg)\b[\s\S]*?<\/\1\s*>/gi, '');
  const text = (s) => s.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /<\/?[a-zA-Z][^>]*>/g;   // a real tag starts with a letter; any other "<" is just text
  const stack = [];
  let out = '';
  let last = 0;
  let m;
  const attrOf = (raw, name) => { const a = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(raw); return a ? (a[1] != null ? a[1] : a[2]).trim() : ''; };
  while ((m = re.exec(src))) {
    out += text(src.slice(last, m.index));
    last = m.index + m[0].length;
    const t = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([\s\S]*?)\/?\s*>$/.exec(m[0]);
    if (!t) continue;
    const name = t[2].toLowerCase();
    if (!allowed.has(name)) continue;
    if (t[1]) {
      const at = stack.lastIndexOf(name);
      if (at === -1) continue;
      while (stack.length > at) out += `</${stack.pop()}>`;
      continue;
    }
    if (name === 'br') { out += '<br>'; continue; }
    let attrs = '';
    if (name === 'a') {
      const href = attrOf(t[3], 'href');
      if (/^(\/(?!\/)|#|https?:\/\/|mailto:|tel:|[a-z0-9][a-z0-9-]*\.html(#[\w-]*)?$)/i.test(href) && !/[<>"'`\s\\]/.test(href)) {
        attrs += ` href="${href}"`;
        if (/^https?:\/\//i.test(href) && attrOf(t[3], 'target') === '_blank') attrs += ' target="_blank" rel="noopener"';
      }
    }
    const cls = attrOf(t[3], 'class').replace(/\byn-[a-z-]+\b/g, '').replace(/\s+/g, ' ').trim();
    if (cls && /^[a-zA-Z0-9 _-]{1,80}$/.test(cls)) attrs += ` class="${cls}"`;
    const dir = attrOf(t[3], 'dir').toLowerCase();
    if (DIRS.has(dir)) attrs += ` dir="${dir}"`;
    const lang = attrOf(t[3], 'lang');
    if (/^[a-zA-Z-]{2,10}$/.test(lang)) attrs += ` lang="${lang}"`;
    out += `<${name}${attrs}>`;
    stack.push(name);
  }
  out += text(src.slice(last));
  while (stack.length) out += `</${stack.pop()}>`;
  return out.replace(/&(?!#?[a-zA-Z0-9]{1,10};)/g, '&amp;').trim();
}
export const cleanInline = (html) => sanitize(clean(html, 8000), INLINE_TAGS).replace(/\s+/g, ' ').trim();
const BLOCK_LEVEL = /^(p|h2|h3|ul|ol|li|blockquote)$/;
// Text typed before the first Enter arrives with no paragraph around it: give every loose line its <p>.
function wrapLoose(html) {
  const re = /<(\/?)([a-z0-9]+)[^>]*>/gi;
  let out = '';
  let last = 0;
  let depth = 0;
  let open = false;
  let m;
  const loose = (s) => {
    if (!s) return;
    if (depth === 0 && !open) { if (!s.trim()) return; out += '<p>'; open = true; }
    out += s;
  };
  while ((m = re.exec(html))) {
    loose(html.slice(last, m.index));
    last = re.lastIndex;
    if (BLOCK_LEVEL.test(m[2].toLowerCase())) {
      if (m[1]) depth = Math.max(0, depth - 1);
      else { if (depth === 0 && open) { out += '</p>'; open = false; } depth++; }
      out += m[0];
    } else {
      if (depth === 0 && !open) { out += '<p>'; open = true; }
      out += m[0];
    }
  }
  loose(html.slice(last));
  if (open) out += '</p>';
  return out;
}
export function cleanBlocks(html) {
  // browsers write <div> for a new line; articles use paragraphs
  const out = sanitize(clean(html, 120000), BLOCK_TAGS).replace(/<div[^>]*>/g, '<p>').replace(/<\/div>/g, '</p>');
  return wrapLoose(out).replace(/<p>\s*(?:<br>\s*)*<\/p>/g, '').trim();
}
export const slugify = (s) => plain(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');

/* ------------------------------ storage ------------------------------ */
// Showing a page must survive a storage hiccup (the page as written is served instead). Saving must NOT: a
// failed read would look like "nothing saved yet" and the save would write that emptiness back.
export async function kvJson(env, key) {
  try { return await env.CONTENT.get(key, { type: 'json' }); } catch (e) { return null; }
}
export const kvStrict = (env, key) => env.CONTENT.get(key, { type: 'json' });

/* ------------------------------ session ------------------------------ */
export const COOKIE = 'yn_admin';
// The cookie is "<expiry>.<signature>"; the signature covers the host, so a cookie from the test copy is useless here.
export const sign = (request, env, until) => hmac(env.SESSION_SECRET || env.ADMIN_PASSWORD, `session:${new URL(request.url).host}:${until}`);
export async function signedIn(request, env) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([0-9]+)\\.([0-9a-f]+)').exec(request.headers.get('cookie') || '');
  if (!m || !env.ADMIN_PASSWORD) return false;
  if (parseInt(m[1], 10) < Date.now()) return false;
  return same(m[2], await sign(request, env, m[1]));
}
export const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
// every state-changing request must come from this site's own pages
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') return origin === new URL(request.url).origin;
  // no usable Origin header: trust the browser's own verdict, which a page on another site cannot forge
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

/* ------------------------------ assets ------------------------------ */
// Read one of the site's own files as text, following the "/about.html" → "/about" style redirects.
export async function assetText(env, origin, path) {
  let url = new URL(path, origin);
  for (let i = 0; i < 3; i++) {
    const r = await env.ASSETS.fetch(new Request(url.toString()));
    const to = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && to) { url = new URL(to, url); continue; }
    return r.ok && (r.headers.get('content-type') || '').includes('text/html') ? r.text() : null;
  }
  return null;
}

// "/about.html", "/about/" and "/about" are one page; the home page is "/"
export function pagePath(pathname) {
  let p = String(pathname || '/').replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}
