# Yancheinu — notes for working on this site

Hand-written static site for **Mrs. S. Eisenbach** (Yancheinu — shidduch & life
coaching, Boro Park). No framework and no build step: every page is a complete
HTML file, and they all share `assets/site.css` and `assets/site.js`.

Pages: `index` · `about` · `services` · `book` · `contact` · `thanks` ·
`calm-before-a-meeting` (the free guide).

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

## The three question sets

"Are You Asking Yourself…" runs three times on the homepage — **Mothers**,
**Singles**, **Shadchanim** — and the Mothers and Shadchanim sets appear *again*
inside their course cards on `services.html`.

**That duplication is deliberate.** If you change a question, change both copies.

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

## The free guide and its PDF

`calm-before-a-meeting.html` is *also* the source of the downloadable PDF —
there is no separate document. A `@media print` block at the bottom of `site.css`
restyles the page into the handout.

**After editing the guide, regenerate the PDF:**

```bash
python3 -m http.server 8080 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=6000 \
  --print-to-pdf="$PWD/assets/yancheinu-3-ways-to-stay-calm.pdf" \
  "http://127.0.0.1:8080/calm-before-a-meeting.html"
```

Then open the PDF and look at it before pushing.

More guides are planned. When the second one arrives, build a `guides.html` index
and point the nav at it — the existing article keeps its URL that way, so anything
already shared still works.

---

## Booking

`book.html` asks which appointment you want first, then embeds that Cal.com
calendar inline.

- free intake — `.../15min` (15 minutes)
- 1:1 session — `.../11` (60 minutes)

Neither event has a price set in Cal.com, so both book free and the session is
invoiced separately. Adding payment is a Cal.com setting, not a site change.

---

## Things that must not be published

The repo root **is** the folder Cloudflare uploads, so anything not listed in
`.assetsignore` becomes a public URL on yancheinu.com. That file keeps `.git`,
`wrangler.jsonc` and this file out of the upload — `.git` was publicly
downloadable for a while before it was added. Leave it in place.
