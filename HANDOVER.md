# Yancheinu — where everything lives

Written so that this website can be recovered and kept running by someone other
than the person who built it. Nothing here is a password. It is a map.

Last updated: 9 August 2026.

---

## The short version

**The website itself is already safe.** All of it — the pages, the styling, the
chat, and the deployment configuration — is in a public GitHub repository. Anyone
with a Cloudflare account can redeploy the entire live site from that repository
with a single command. Nothing about the site is trapped on one person's laptop.

**The one thing that is not replaceable is the domain name.** `yancheinu.com` is
registered with Cloudflare, inside Abraham's Cloudflare account. That is the single
point of failure worth planning around.

---

## The pieces

| What | Where | Who controls it |
|---|---|---|
| Website source code | GitHub — `jgffyjbv/yancheinu` (public) | Abraham owns it; **Mrs. Eisenbach's account `yancheinucoaching-hub` has write access** |
| Live hosting | Cloudflare Worker named `yancheinu` | Abraham's Cloudflare account, `avrumy95@gmail.com` |
| Domain `yancheinu.com` | **Registered with Cloudflare Registrar**, same account | Same account |
| DNS | Cloudflare nameservers `daisy` / `major.ns.cloudflare.com` | Same account |
| The chat | Cloudflare Workers AI, free allowance | Same account |
| Booking calendars | Cal.com — `yancheinu-coaching-by-simy-eisenbach-bxlkyj` | **Mrs. Eisenbach's own account** |
| Contact form delivery | FormSubmit → yancheinucoaching@gmail.com | Her email |
| Newsletter | MailerLite | **Her own account** |

Useful identifiers (not secrets):

- Cloudflare account ID: `7595a476b4581184323bab93487cbb3a`
- Cloudflare zone ID for yancheinu.com: `9f7799e3cb9f1ee1d61753d94fe208e2`
- Worker name: `yancheinu`

Note that the booking, the newsletter and the contact email are **already hers**.
If Abraham were unavailable tomorrow, none of those would be affected.

---

## How the site gets published

Pushing to `main` on GitHub triggers a Cloudflare build that runs
`npx wrangler deploy`. That is the whole pipeline. It can also be run by hand from
a copy of the repository with the same command.

Everything the deploy needs — `wrangler.jsonc`, the Worker code in `worker/`, the
static files — is committed. There is no hidden build step and no secret key. The
chat uses Cloudflare's own AI binding, so there is no API key to lose.

---

## If Abraham is unavailable

**To keep editing the content:** nothing special is needed. Mrs. Eisenbach already
has write access to the repository, and pushes still publish, because the build
runs on Cloudflare and not on anyone's computer.

**To move the site to a different Cloudflare account** (for example, hers), a
developer needs about an hour:

1. Create a Cloudflare account.
2. Clone `https://github.com/jgffyjbv/yancheinu` — it is public, so this needs no permission.
3. Run `npx wrangler deploy`. The site now exists at `<name>.workers.dev`.
4. Point `yancheinu.com` at it — this is the step that needs the domain.

**To recover the domain**, which is the hard part:

- It is registered through Cloudflare Registrar, so there is no separate registrar
  account to log into. It is reached only through the Cloudflare account above.
- The registrant contact and billing details on that account are the proof of
  ownership. Cloudflare support can act on a domain dispute with that evidence.
- ICANN rules lock a newly registered domain against transfer for 60 days.
  Registered 14 July 2026, so it became transferable in mid-September 2026.

**Worst case**, if the domain could not be recovered: the entire site can be
redeployed on a new domain from the public repository in an afternoon. What would
be lost is the address itself — the printed material, the newsletter links and the
search history pointing at yancheinu.com — not the work.

---

## A note on Cloudflare access

Abraham's Cloudflare account hosts other clients' websites and databases as well as
this one. Cloudflare only allows permissions to be limited to a single domain on
its Enterprise plan, so adding someone to that account as a member would give them
administrator access to everything in it, not just Yancheinu.

That is why access to that account has deliberately **not** been shared, and why
this document exists instead. If genuine independence is ever wanted, the clean
version is to move `yancheinu.com` and the Worker into a Cloudflare account in
Mrs. Eisenbach's own name, with Abraham invited into *her* account as a member —
the reverse of the current arrangement.
