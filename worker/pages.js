/**
 * Finds every piece of wording on a page and lets the owner's saved wording stand in for it.
 *
 * The pages are plain hand-written HTML with no build step, so nothing in them is marked as "editable".
 * Instead each page is read here, and every run of text gets a name made from the text itself (a fingerprint).
 * That has one deliberate consequence: when a sentence is rewritten in the HTML file, its fingerprint changes
 * and the wording saved for the OLD sentence quietly stops applying. The newest edit wins, whichever side
 * made it, and a saved change can never land on the wrong sentence.
 *
 * Names start with a letter for where the text sits: "h" header, "f" footer (both shared by every page, so
 * they are saved once for the whole site) and "m" for the page's own content.
 */
import { hash53, esc } from './lib.js';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// read past these without looking inside: not wording, or not safe to edit as wording
const OPAQUE = new Set(['head', 'script', 'style', 'svg', 'noscript', 'iframe', 'select', 'textarea', 'template', 'object', 'video', 'audio', 'canvas']);
const INLINE = new Set(['a', 'strong', 'b', 'em', 'i', 'br', 'span', 'small', 'sup', 'sub', 'u', 'mark', 'cite', 'bdi']);

function parse(html) {
  const root = { tag: '#root', attrs: '', children: [], innerStart: 0, innerEnd: html.length };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let last = 0;
  let m;
  const text = (to) => { if (to > last) stack[stack.length - 1].children.push({ text: true, start: last, end: to }); };
  while ((m = re.exec(html))) {
    text(m.index);
    last = re.lastIndex;
    if (m[1]) {
      const name = m[1].toLowerCase();
      let at = stack.length - 1;
      while (at > 0 && stack[at].tag !== name) at--;
      if (at === 0) continue;   // a closing tag with nothing open: leave it alone
      // anything left open inside it ends where this closing tag begins
      while (stack.length > at) { const el = stack.pop(); el.innerEnd = m.index; el.end = stack.length === at ? re.lastIndex : m.index; }
      continue;
    }
    if (!m[2]) continue;        // comment or doctype
    const name = m[2].toLowerCase();
    const el = { tag: name, attrs: m[3] || '', start: m.index, nameEnd: m.index + 1 + m[2].length, innerStart: re.lastIndex, innerEnd: re.lastIndex, end: re.lastIndex, children: [] };
    stack[stack.length - 1].children.push(el);
    if (VOID.has(name) || /\/\s*$/.test(el.attrs)) { el.empty = true; continue; }
    if (OPAQUE.has(name)) {
      const close = new RegExp('</' + name + '\\s*>', 'ig');
      close.lastIndex = re.lastIndex;
      const c = close.exec(html);
      el.opaque = true;
      el.innerEnd = c ? c.index : html.length;
      el.end = re.lastIndex = last = c ? close.lastIndex : html.length;
      continue;
    }
    stack.push(el);
  }
  text(html.length);
  while (stack.length > 1) { const el = stack.pop(); el.innerEnd = el.end = html.length; }
  return root;
}

const hasAttr = (el, name) => new RegExp('(?:^|\\s)' + name + '(?:\\s|=|$)').test(el.attrs);
const hidden = (el) => /(?:^|\s)aria-hidden\s*=\s*["']?true/.test(el.attrs);
const skip = (el) => el.opaque || hasAttr(el, 'data-noedit') || hidden(el);

/** The list of editable pieces on a page, in the order they appear. */
export function compile(html) {
  const root = parse(html);
  const units = [];
  const seen = {};
  const blank = (node) => !/[^\s]/.test(html.slice(node.start, node.end).replace(/&nbsp;/g, ' '));
  const directText = (el) => el.children.some((c) => c.text && !blank(c));
  const wording = (c) => c.text || (INLINE.has(c.tag) && !skip(c) && (c.empty || inlineOnly(c)));
  const inlineOnly = (el) => el.children.every(wording);
  const add = (zone, start, end, el) => {
    // keep the surrounding spaces and line breaks outside the editable piece
    while (start < end && /\s/.test(html[start])) start++;
    while (end > start && /\s/.test(html[end - 1])) end--;
    const norm = html.slice(start, end).replace(/\s+/g, ' ');
    if (!norm) return;
    let key = zone + hash53(norm);
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] > 1) key += '~' + seen[key];   // the same words twice on one page: second copy, third copy…
    units.push(el ? { key, start, end, attrAt: el.nameEnd } : { key, start, end });
  };
  const visit = (el, zone) => {
    if (el.tag === 'header' && /site-header/.test(el.attrs)) zone = 'h';
    else if (el.tag === 'footer' && /site-footer/.test(el.attrs)) zone = 'f';
    if (el.empty || skip(el)) return;
    if (!directText(el)) { for (const c of el.children) if (!c.text) visit(c, zone); return; }
    if (el !== root && el.tag !== 'body' && inlineOnly(el)) { add(zone, el.innerStart, el.innerEnd, el); return; }
    // text sitting next to something that is not wording (an icon, a block): each stretch of text is its own piece
    let run = [];
    const flush = () => {
      if (run.some((c) => c.text && !blank(c))) add(zone, run[0].start, run[run.length - 1].end, null);
      else for (const c of run) if (!c.text) visit(c, zone);
      run = [];
    };
    for (const c of el.children) {
      if (wording(c)) { run.push(c); continue; }
      flush();
      visit(c, zone);
    }
    flush();
  };
  visit(root, 'm');
  return units;
}

/** The page with the owner's wording put in. With `mark`, each piece is also labelled for the in-page editor. */
export function render(html, units, overrides, mark) {
  let out = '';
  let at = 0;
  const admin = !!mark;
  for (const u of units) {
    const v = overrides[u.key];
    const has = typeof v === 'string' && v !== '';
    if (!admin && !has) continue;
    if (u.attrAt != null) {
      if (admin) { out += html.slice(at, u.attrAt) + ` data-e="${u.key}"`; at = u.attrAt; }
      if (has) { out += html.slice(at, u.start) + v; at = u.end; }
    } else {
      out += html.slice(at, u.start) + (admin ? `<span data-e="${u.key}">` : '') + (has ? v : html.slice(u.start, u.end)) + (admin ? '</span>' : '');
      at = u.end;
    }
  }
  return out + html.slice(at);
}

// compiled pages are remembered for as long as this copy of the Worker lives; the page's own text is the key
const CACHE = new Map();
export function unitsFor(html) {
  const sig = html.length + ':' + hash53(html);
  let units = CACHE.get(sig);
  if (!units) {
    units = compile(html);
    if (CACHE.size > 60) CACHE.clear();
    CACHE.set(sig, units);
  }
  return units;
}

/* ------------------------------ page title & Google description ------------------------------ */
const headOf = (html) => { const i = html.search(/<\/head\s*>/i); return i === -1 ? 0 : i; };
const meta = (head, pattern) => { const m = pattern.exec(head); return m ? m[1] : ''; };

export function readSeo(html) {
  const head = html.slice(0, headOf(html));
  return {
    title: meta(head, /<title[^>]*>([\s\S]*?)<\/title>/i).trim(),
    description: meta(head, /<meta\s+name="description"\s+content="([^"]*)"/i),
  };
}

export function applySeo(html, seo) {
  if (!seo || (!seo.title && !seo.description)) return html;
  const cut = headOf(html);
  let head = html.slice(0, cut);
  const set = (pattern, value) => { head = head.replace(pattern, (m, a, b) => a + esc(value) + b); };
  if (seo.title) {
    set(/(<title[^>]*>)[\s\S]*?(<\/title>)/i, seo.title);
    set(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, seo.title);
  }
  if (seo.description) {
    set(/(<meta\s+name="description"\s+content=")[^"]*(")/i, seo.description);
    set(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, seo.description);
  }
  return head + html.slice(cut);
}
