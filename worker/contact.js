/**
 * The Contact page's form (contact.html posts here, to /api/contact).
 *
 * It is an ordinary form post with no script, so it works on old iPads and filtered phones too. Every message
 * is SAVED in the site's own database first and only then emailed to Mrs. Eisenbach. Nothing can be lost that
 * way: if the email ever fails, the message still waits for her in /admin → Messages.
 *
 * Until Nov 2026 the form went straight to FormSubmit, an outside service that emailed her and kept nothing
 * here. When she wrote that visitors were reaching the thank-you page but no messages arrived, there was no
 * record anywhere to check. That is why every message is kept now.
 */
import { esc, clean, field, assetText } from './lib.js';
import { strikes, strike } from './stats.js';

const PER_IP_HOUR = 5;     // messages one connection may send in an hour
const PER_DAY = 200;       // messages the site accepts in a day, all together
// Emails in a day. The Cloudflare account's sending allowance (about 200 a day) is shared with other websites,
// so a flood here must not use it up. Messages over the limit are still saved — they just aren't emailed.
const MAIL_PER_DAY = 40;
const MAX_BYTES = 20000;
const PHONES = 'You can also call or text Mrs. Eisenbach: <a href="tel:+17189264773">718-926-4773</a> · <a href="tel:+13477662269">347-766-2269</a>';

const ipOf = (request) => { const ip = request.headers.get('cf-connecting-ip') || 'unknown'; return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip; };
const EMAIL_OK = /^[^\s@<>"'(),;:\\]+@[^\s@<>"'(),;:\\]+\.[^\s@<>"'(),;:\\]{2,}$/;

/* ------------------------------ advertising and robots ------------------------------ */
// Scored, not blocked: anything that scores 3 or more is SAVED with a "looked like advertising" mark and not
// emailed, so a real message that trips a rule is never lost — it shows under Messages → "Show …".
// Hebrew is never a signal: people write in Yiddish and Hebrew.
const FOREIGN_SCRIPT = /[Ѐ-ԯ԰-֏؀-ۿݐ-ݿ぀-ヿ㐀-鿿가-힯]/;
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,10}\/\S/i;
const ADS = /\b(seo|backlinks?|casino|crypto|bitcoin|forex|viagra|cialis|guest posts?|web traffic|lead generation|first page of google|marketing services)\b/i;
const LATIN = /\b(ego volo|volo scire|vestri pretium|pretium|quaeso|gratias)\b/i;
const DIACRITICS = /[À-ÖØ-öø-ÿĀ-ſ]/;

export function spamScore(f) {
  const all = [f.name, f.email, f.phone, f.interest, f.message].join(' ');
  let s = 0;
  if (f.trap) s += 10;                                  // the hidden box only a robot fills in
  if (FOREIGN_SCRIPT.test(all)) s += 3;
  // a link is a strong sign of advertising — except a mention of this very website
  if (LINK.test(f.message.replace(/(?:https?:\/\/)?(?:www\.)?yancheinu\.com\S*/gi, ''))) s += 3;
  if (ADS.test(all)) s += 3;
  if (/https?:|www\.|\.[a-z]{2,10}\//i.test(f.name)) s += 4;
  if (LATIN.test(all)) s += 4;
  if (DIACRITICS.test(f.name + ' ' + f.message)) s += 1;
  return s;
}

/* ------------------------------ reading the form ------------------------------ */
// Read with a size cap instead of trusting a Content-Length header: filtering proxies often send the body
// in pieces without one.
async function readForm(request) {
  const reader = request.body && request.body.getReader();
  if (!reader) return { form: new URLSearchParams() };
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { try { await reader.cancel(); } catch (e) { /* already closed */ } return { tooBig: true }; }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.byteLength; }
  // the multipart boundary is case-sensitive, so the header is passed on exactly as it came
  const type = request.headers.get('content-type') || '';
  try {
    if (/multipart\/form-data/i.test(type)) return { form: await new Response(bytes, { headers: { 'content-type': type } }).formData() };
    return { form: new URLSearchParams(new TextDecoder().decode(bytes)) };
  } catch (e) { return null; }
}

function fieldsOf(form) {
  const get = (k) => form.get(k) || '';
  return {
    name: field(get('name'), 100),
    email: clean(get('email'), 200),
    phone: field(get('phone'), 40),
    interest: field(get('interest'), 80),
    // the message keeps its line breaks; it is escaped wherever it is shown
    message: clean(String(get('message')).replace(/\r\n?/g, '\n'), 5000),
    trap: clean(get('hp_y5'), 200),
  };
}

/* ------------------------------ the email ------------------------------ */
/** Email one message (or, with test:true, a short test) to Mrs. Eisenbach. Never throws. */
export async function notify(env, f, { test = false } = {}) {
  if (!env.EMAIL || !env.CONTACT_TO || !env.MAIL_FROM) return { ok: false, note: 'email is not set up on this copy of the website' };
  const subject = test ? 'Test: your website can email you' : `New message from the website — ${f.name}`;
  const rows = test ? [] : [['Name', f.name], ['Email', f.email], ['Phone', f.phone], ['Interested in', f.interest], ['Message', f.message]].filter((r) => r[1]);
  const lead = test
    ? 'This is the test you asked for in your website\'s Messages screen. Messages from the Contact page arrive exactly like this one.'
    : 'Someone sent a message from the Contact page of yancheinu.com.';
  const html =
    '<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;padding:24px;color:#26382C">' +
    '<div style="font-size:20px;color:#142E21;margin-bottom:4px">Yancheinu · website</div>' +
    `<div style="font-size:16px;margin-bottom:18px;color:#5D6E60">${esc(lead)}</div>` +
    (rows.length ? '<table style="border-collapse:collapse">' + rows.map(([k, v]) =>
      '<tr><td style="padding:8px 16px 8px 0;color:#5D6E60;font-size:12px;text-transform:uppercase;letter-spacing:.06em;vertical-align:top;white-space:nowrap">' + esc(k) +
      '</td><td style="padding:8px 0;font-size:16px;white-space:pre-wrap" dir="auto">' + esc(v) + '</td></tr>').join('') + '</table>' : '') +
    `<p style="margin-top:22px;font-size:13px;color:#5D6E60">${test ? '' : `Press Reply to answer ${esc(f.name)} directly. `}Every message is also kept at <a href="https://yancheinu.com/admin/messages" style="color:#C9702E">yancheinu.com/admin</a> → Messages.</p></div>`;
  const text = lead + '\n\n' + rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\n${test ? '' : `Press Reply to answer ${f.name} directly.\n`}Every message is also kept at https://yancheinu.com/admin/messages`;
  const mail = { to: env.CONTACT_TO, from: { email: env.MAIL_FROM, name: 'Yancheinu website' }, subject, html, text };
  // the visitor's own address is only ever the reply-to — this form never sends anything TO an address it was given
  if (!test && EMAIL_OK.test(f.email)) mail.replyTo = f.email;
  try {
    await env.EMAIL.send(mail);
    return { ok: true, note: '' };
  } catch (e) {
    console.error(JSON.stringify({ message: 'contact email failed', error: String((e && e.message) || e) }));
    return { ok: false, note: String((e && e.message) || e).slice(0, 200) };
  }
}

async function mailAndRecord(env, id, f) {
  let status;
  if ((await strikes(env, 'contact-mail')) >= MAIL_PER_DAY) status = 'not emailed: the daily email limit was reached';
  else {
    await strike(env, 'contact-mail', 86400);
    const r = await notify(env, f);
    status = r.ok ? 'sent' : 'failed: ' + r.note;
  }
  try { await env.DB.prepare('UPDATE messages SET mail = ? WHERE id = ?').bind(status, id).run(); } catch (e) { /* the message itself is saved */ }
}

/* ------------------------------ answers ------------------------------ */
const toThanks = () => new Response(null, { status: 303, headers: { location: '/thanks', 'cache-control': 'no-store' } });

// A short page in the site's own header and footer, for the rare case a message cannot be taken.
async function problem(env, url, status, heading, text) {
  const shell = await assetText(env, url.origin, '/contact').catch(() => null);
  const body = `
<section class="section" style="padding-top:150px" data-noedit>
  <div class="wrap wrap--narrow center">
    <span class="eyebrow" style="justify-content:center">Your message</span>
    <h1 style="font-size:clamp(2rem,4vw,2.8rem)">${esc(heading)}</h1>
    <p style="margin-top:16px">${text}</p>
    <p style="margin-top:12px">${PHONES}</p>
    <div class="hero__actions" style="justify-content:center"><a class="btn" href="/contact">Back to the contact page</a></div>
  </div>
</section>
`;
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' };
  if (!shell) return new Response(`<!doctype html><meta charset="utf-8"><title>${esc(heading)}</title><h1>${esc(heading)}</h1><p>${text}</p><p>${PHONES}</p>`, { status, headers });
  const out = shell
    .replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, (m, a, b) => a + body + b)
    .replace(/(<title[^>]*>)[\s\S]*?(<\/title>)/i, (m, a, b) => a + esc(heading) + ' | Yancheinu' + b)
    .replace(/<head>/i, '<head>\n<base href="/">\n<meta name="robots" content="noindex">');
  return new Response(out, { status, headers });
}

/* ------------------------------ the handler ------------------------------ */
export async function handleContact(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return new Response(null, { status: 303, headers: { location: '/contact' } });
  try {
    // Only refuse a post that says it came from another website. Older iPads send no Origin at all; they are welcome.
    const origin = request.headers.get('origin');
    if (origin && origin !== 'null' && origin !== url.origin) return problem(env, url, 403, 'This message could not be sent', 'It did not come from this website\'s own contact page.');

    const read = await readForm(request);
    if (read && read.tooBig) return problem(env, url, 413, 'This message could not be sent', 'It was too long to send in one piece. Please press your browser\'s Back button, shorten it a little, and send it again.');
    if (!read) return problem(env, url, 400, 'This message could not be sent', 'It arrived in a form the website could not read. Please press your browser\'s Back button and send it again.');
    const f = fieldsOf(read.form);
    if (!f.name || !EMAIL_OK.test(f.email)) return problem(env, url, 400, 'Almost there', 'Please press your browser\'s Back button — what you typed is still there — and fill in your name and a working email address.');

    const ip = ipOf(request);
    if ((await strikes(env, 'contact:' + ip)) >= PER_IP_HOUR) return problem(env, url, 429, 'Thank you — we already have your messages', 'Several messages were sent from this connection in the last hour. Please wait a little before sending another.');
    if ((await strikes(env, 'contact:all')) >= PER_DAY) return problem(env, url, 503, 'This message could not be sent just now', 'The website is receiving an unusual number of messages. Please try again later.');
    await strike(env, 'contact:' + ip, 3600);
    await strike(env, 'contact:all', 86400);

    const spam = spamScore(f) >= 3;
    let id = null;
    try {
      const r = await env.DB.prepare('INSERT INTO messages (at, name, email, phone, interest, message, spam, mail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(Date.now(), f.name, f.email, f.phone, f.interest, f.message, spam ? 1 : 0, spam ? 'not emailed: looked like advertising' : 'sending').run();
      id = r.meta && r.meta.last_row_id;
    } catch (e) {
      console.error(JSON.stringify({ message: 'contact message not saved', error: String((e && e.message) || e) }));
    }

    if (spam) return toThanks();       // a robot is told it worked; the message is kept, not emailed
    if (id) {                          // saved: the email can go out after the visitor has moved on
      ctx.waitUntil(mailAndRecord(env, id, f));
      return toThanks();
    }
    // Not saved: the email is now the only copy, so wait for it and answer truthfully.
    const sent = await notify(env, f);
    if (sent.ok) return toThanks();
    return problem(env, url, 503, 'This message could not be sent just now', 'Something went wrong on our side and your message did not go through. We are sorry.');
  } catch (err) {
    console.error(JSON.stringify({ message: 'contact form failed', error: String((err && err.stack) || err) }));
    return problem(env, url, 500, 'This message could not be sent just now', 'Something went wrong on our side and your message did not go through. We are sorry.');
  }
}
