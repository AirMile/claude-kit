---
name: intake
description: Draft the one-time client questions for SEO and record the answers in docs/seo.md. Use with /intake.
argument-hint: "[nothing | the client's answers, pasted or as a file path]"
---

# Intake

The client knows what no tool can find: what earns money, who buys, which questions they hear on
the phone. This skill asks them once, tailored to what is already known, and records the answers
where `/seo` reads them. Measuring (`/scan`) and re-planning (`/seo`) never need it again.

## 0. Route

- Not a kit project (no `AGENTS.md` and `docs/`) → stop: `/setup` first; the answers need a
  `docs/seo.md` to live in.
- `## Intake` in `docs/seo.md` has answers → say so, list the questions still `open`, point to
  `/seo`. Never ask the full set again; one answer changed → edit that line.
- `## Intake` has questions without answers, and the arg or message holds answers → **Record**.
- Otherwise → **Draft**.

## Draft

1. **What is known**, so no question asks it: `docs/product.md`, the newest `## Measurements`
   entry or a `seo-scan-*.md`, and the live site (home, services or products, about, contact;
   WebFetch). Settle the business type: **local service** (works in an area), **B2B niche**
   (specialist buyers, sectors, standards) or **webshop** (products, prices). Note the region,
   the services and the proof the site already shows.
2. **Competitors**: 2-3, from WebSearch "<main service> <region>" and the names the scan's AI
   check returned. Note what they show that this site doesn't: a service, a sector page,
   certifications, prices.
3. **Questions** from `${CLAUDE_SKILL_DIR}/references/questions.md`: the core set plus the
   variants for the business type. Rewrite each with what you found (name the service, the
   competitor, the region); drop what the site or `docs/product.md` already answers. Max 12.
   Keep only questions whose answer changes what `/seo` plans.
4. **Write** `## Intake` in `docs/seo.md` (missing → create the file with the header and the
   empty sections from `${CLAUDE_PLUGIN_ROOT}/skills/seo/SKILL.md` § Format): `Asked: <date>`,
   then the questions under `### Goal`, `### Customers`, `### Offer`, `### Proof`,
   `### Access`, each as `- <question> → open`.
5. **Message** for the client, in chat, in the client's language, ready to send:
   - one line on why: so the site is found for what earns them money;
   - the questions, numbered, with "answer in your own words, skip what you don't know";
   - the access requests: add `<user's email>` as a user in Search Console (Settings → Users
     and permissions → Add user → Full), in Google Analytics and in the Business Profile. Steps
     only where you checked them in the product's own help; otherwise just name what to grant.
     The user's email: from git config, else ask.

Stop there: the client answers later, in their own time.

## Record

The user pastes the answers or gives a file. Fill each `→ open` with the answer, in the client's
words, shortened only where needed; set `Answered: <date>`. Unanswered stays `open`. An answer
that contradicts `docs/product.md` (a service it excludes, another audience) → name it and ask
which one holds.

Then: goal, main services and region known → next is `/seo`. One of those still open → list
what to chase and stop.

## Report

```
INTAKE · <draft | record>
type       <local service | B2B niche | webshop>
questions  <n> asked · <n> answered · <n> open
access     Search Console <asked | granted | —> · Analytics <…> · Business Profile <…>
next       <send the message | /seo | chase: <open must-haves>>
```
