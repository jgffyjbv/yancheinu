# Yancheinu — notes for working on this site

Hand-written static site for **Mrs. Simy Eisenbach** (Yancheinu — shidduch & life
coaching, Boro Park). No framework and no build step: every page is a complete
HTML file, and they all share `assets/site.css` and `assets/site.js`.

Pages: `index` · `about` · `services` · `kallahs` · `shidduch-package` (her 3-month package) · `book` · `contact` · `thanks` ·
`guides` (the Free Guides index) · `calm-before-a-meeting` and `support-without-taking-over`
(the two free guides) · `blog` (the frame for the blog — see below).

A small Worker (`worker/`) sits in front of the pages. It adds the chat, the
owner's **/admin** screens, the blog and the visitor count. Read "The back end"
below before changing wording — some of the wording on the live site is not in
these files.

---

## Publishing — read this first

**Pushing to `main` publishes the live site at yancheinu.com. There is no staging.**
A Cloudflare build runs `npx wrangler deploy` on every push and takes about a minute.

- If you are unsure about a change, make a branch and open a pull request instead
  of pushing to `main`.
- **Always check with a cache-buster:** `https://yancheinu.com/book?x=1`.
  Cloudflare serves cached pages, so a normal reload will happily show you the old
  version and make you think nothing happened. This has fooled us more than once.
- To publish from a terminal instead of pushing: `npx wrangler deploy`
- To undo a bad change: `git revert <commit>` and push, or roll back in the
  Cloudflare dashboard under Workers → yancheinu → Deployments.

---

## House rules for the copy

These came from the client directly. Please don't "improve" them away.

- **She is a coach, not a shadchan.** She has worked *in* the shidduch world for
  30+ years — always past tense. Shadchanim are her clients and audience, never
  her role.
- **Say "meeting", never "bashow".** A chasidish bashow involves few meetings while
  dating involves many, so "bashow" excludes half the audience.
- **Sessions are "in person, over Zoom, or by phone"** — in person always first.
  This phrase appears on `index`, `services`, `book`, `contact` and the guide.
  Change all of them together.
- Both numbers are call **and** text: 347-766-2269 and 718-926-4773. The booking
  page leads with 718.
- Hebrew and Yiddish terms stay as they are — no italics, no explanations. The
  audience knows them.

---

## The four question sets

The homepage runs four sets of questions — **Mothers**, **Singles**, **Kallahs**,
**Shadchanim**. The Mothers and Shadchanim sets appear *again* inside their course
cards on `services.html`, and the Kallah set appears again on `kallahs.html`.

**That duplication is deliberate.** If you change a question, change both copies.

The same goes for the 3-month package's "What you'll receive" list: it is on
`shidduch-package.html` and again in the `#package` block on `services.html`.

---

## The back end — /admin

Mrs. Eisenbach signs in at **yancheinu.com/admin** with one password. From there she can:

- **read every message sent from the Contact page** (Messages);
- **publish a free guide** (Free Guides) — paste it from Word, press Publish, and the website
  makes the guide's page and its PDF download by itself;
- **change the wording of any page** — click a sentence on the page itself and type;
- **write the blog** — drafts, publish, take offline;
- **see her visitors** — per day, per page, where they came from.

Three things follow from that, and they matter when you edit these files:

1. **The live site can show different words than the HTML file.** That is not a
   bug: it means the sentence was reworded in /admin. Her wording is stored by
   Cloudflare (KV), not in this repository, and is put into the page as it is served.
2. **If you rewrite a sentence in an HTML file, her saved wording for that sentence
   is dropped** and your new sentence shows. (Each saved change is tied to the exact
   original text; change the text and the tie is gone.) So before rewording
   something here, check the live page — if it reads differently from the file, the
   live wording is the newer one and probably the one to keep.
3. **The blog articles are not in this repository at all.** `blog.html` is only the
   frame: the Worker pours the list of articles into the `data-posts` box, and
   builds each article page from the same file. Leave the `data-posts` box, the
   `data-blog-empty` line and the two comments (`/posts` and `post-keep`) where
   they are.

Also:

- **The header and the footer must be the same on every page.** Her wording for
  the menu and footer is saved once for the whole site. If you change the menu or
  footer, change it on every page (they keep the classes `site-header` and
  `site-footer`).
- The `<li data-blog-link>` items in the menu and footer are hidden by the Worker
  until the first article is published. Leave the attribute on them.
- **Adding a page:** copy an existing page for the header and footer, and add the
  page to `sitemap.xml` — that is also what makes it appear in /admin under Pages.
- Add `data-noedit` to an element to keep its text out of the in-page editor.
- The password and the cookie-signing key are Cloudflare secrets
  (`ADMIN_PASSWORD`, `SESSION_SECRET`). They are not in this repository and must
  never be added to it.
- The Worker code is split by job: `index.js` (routing, serving pages), `pages.js`
  (finding and replacing wording), `blog.js`, `stats.js` (visitors), `admin.js`
  (the /admin screens), `chat.js`, `contact.js` (the Contact page's form).
- The blog's "Who is it for" choices are the `AUDIENCES` list in `worker/blog.js`.
  "For mothers" was renamed "For parents" at her request; `audienceOf()` shows old
  articles under the new name, so a renamed choice needs an entry in `RENAMED` there. The browser side of the editor is in
  `assets/admin/`.
- A private test copy can be deployed with
  `npx wrangler deploy --config wrangler.staging.jsonc`
  (yancheinu-staging.avrumy95.workers.dev, separate storage).

---

## The contact form

The form on `contact.html` posts to the website itself (`/api/contact`, handled by
`worker/contact.js`). Every message is **saved in the site's database first** (D1 table
`messages`) and then emailed to yancheinucoaching@gmail.com from
`website@notify.yancheinu.com` (Cloudflare Email Sending). She sees every message in
/admin → Messages, with whether its email went out, and can send herself a test email
from there.

- **Do not point the form at FormSubmit or any other outside service again.** Until
  Nov 2026 it went to FormSubmit, which kept no record here; when she asked why
  visitors reached the thank-you page but no messages arrived, nothing could be checked.
- Keep the field names (`name`, `phone`, `email`, `interest`, `message`, and the hidden
  `hp_y5` that only robots fill in). Adding a choice to "I'm interested in" needs no
  other change.
- Messages that look like advertising (links, SEO pitches, foreign scripts other than
  Hebrew) are kept but not emailed — they appear under Messages → "set aside".
  Hebrew and Yiddish are never treated as a warning sign.

---

## The hero on `index.html`

The hero is a single inline `<svg class="hero__road">` holding three things: the
photograph, a hand-traced path down the road's centreline (`#yRoad`), and the
pasuk that drives along it via `animateMotion`.

**Don't refactor this into a CSS background image.** The Hebrew only stays glued
to the road because the photo and the path live in one coordinate space.

The timing was tuned with the client after two rounds of feedback. Don't shorten it:

- `keyPoints="0.30;0.94"` — it must travel the *whole* road, into the mist at the top
- `dur="32s"` on all three animations
- fade `values="0;.92;.92;.6;0" keyTimes="0;.03;.80;.94;1"` — it must be visible
  about a second after the page opens

Below 920px, and for anyone with reduced-motion turned on, the plain `.hero__pasuk`
line is shown instead.

---

## The free guides and their PDFs

Each guide page is *also* the source of its downloadable PDF — there is no separate
document: `calm-before-a-meeting.html` → `assets/yancheinu-3-ways-to-stay-calm.pdf`,
`support-without-taking-over.html` → `assets/yancheinu-support-without-taking-over.pdf`. A `@media print` block at the bottom of `site.css`
restyles the page into the handout.

**After editing the guide, regenerate the PDF** (the same applies after the guide's
wording is changed in /admin — to include those changes, print the live address
`https://yancheinu.com/calm-before-a-meeting` instead of the local file):

```bash
python3 -m http.server 8080 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=6000 \
  --print-to-pdf="$PWD/assets/yancheinu-3-ways-to-stay-calm.pdf" \
  "http://127.0.0.1:8080/calm-before-a-meeting.html"
```

(For the other guide, swap both file names.) Each PDF should come out at two pages;
the parents guide prints its chapters two-across (`grid--chapters`) to stay at two.

Then open the PDF and look at it before pushing.

**She wants guides to be "Free Guides", not blog posts** — "I think it attracts" (Nov 2026).
The menu's "Free Guides" opens `guides.html`, which lists every guide, newest first.

**New guides are added in /admin → Free Guides, not as HTML files** (since Nov 8 2026 — her
request: "make sure next time she can do it herself"). She pastes the guide from Word, picks who
it is for, and presses Publish. `worker/guides.js` then:
- keeps the guide in KV (`guide:<slug>`, list in `guides:index`) and shows it at
  `/guides/<slug>` — guides.html with `<main>` swapped, like the blog;
- pours a card for it into guides.html between `<!-- guides … -->` and `<!-- /guides -->`,
  ahead of the two built-in guides (leave those markers where they are);
- **makes the PDF download itself** with Cloudflare Browser Rendering (the `BROWSER` binding):
  it prints the guide's page with the same `@media print` styles, keeps the PDF in KV
  (`guidepdf:<slug>`) and serves it at `/guides/<slug>.pdf`. It is remade on every save of a
  published guide; "Make the PDF again" in the editor does it by hand.
- turns lines that start with ☐ (as in her Word files) into a checklist with tick boxes.
- adds the guide to the sitemap and tells the chat about it.

The first Shadchanim guide ("A Shadchan's Quick Follow-Up Checklist") was added this way.
The two older guides above stay as HTML pages with hand-made PDFs.

**This means the Worker has one npm dependency, `@cloudflare/puppeteer`** (`package.json`).
Run `npm install` before `npx wrangler deploy` on a new computer; Cloudflare's own build
(on every push) installs it by itself. `@puppeteer/browsers` is replaced by an empty stand-in
(`worker/stubs/`, see `overrides` in package.json): only the Node launcher uses it, never the
Worker, and the web filter on the developer's Mac blocks one of its sub-packages.

---

## Booking

`book.html` asks which appointment you want first, then embeds that Cal.com
calendar inline.

- free intake — `.../15min` (15 minutes)
- 1:1 session — `.../11` (60 minutes)

Neither event has a price set in Cal.com, so both book free and the session is
invoiced separately. Adding payment is a Cal.com setting, not a site change.

The four package / follow-up cards open the 15-minute calendar with the choice
in the booking notes. The prices on the cards are hers, saved in /admin — don't
edit the price lines in `book.html`, or her saved changes stop applying.

The last card, **Emergency Session** ($500, outside regular hours incl. erev
Shabbos / erev Yom Tov), is a plain phone link (`tel:` 718-926-4773) with
`data-direct`, so the script does not open a calendar for it. Keep it the LAST
card: saved /admin edits are matched by text and by order on the page.

---

## Things that must not be published

The repo root **is** the folder Cloudflare uploads, so anything not listed in
`.assetsignore` becomes a public URL on yancheinu.com. That file keeps `.git`,
`wrangler.jsonc`, the `worker/` folder and this file out of the upload — `.git` was publicly
downloadable for a while before it was added. Leave it in place.
