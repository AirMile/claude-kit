---
name: scan
description: Measure how findable a live site is: a free check for a prospect, or the monthly measurement. Use with /scan.
argument-hint: "[url | nothing for the production URL]"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/seo-facts.js *)
---

# Scan

Measures where a site stands in search. It never fixes and never plans: fixing is `/build` and
`/audit`, planning is `/seo`, and the questions for the client are `/intake` (asked once; a
monthly scan never repeats them). Same steps every time, so measurements compare.

## 0. Mode

- **Prospect**: cwd is not a kit project (no `AGENTS.md` and `docs/`) → URL required. Output is a
  one-page report for someone who is not a client yet. A sibling folder (`../<name>`) is a kit
  project whose code or `AGENTS.md` names that domain → it is a client: measure there instead.
- **Measure**: kit project → URL = arg, else the production URL from `AGENTS.md`, else ask. Output
  goes into `docs/seo.md` § Measurements. File missing → create it with the header and the empty
  sections from `${CLAUDE_PLUGIN_ROOT}/skills/seo/SKILL.md` § Format.
- The site is not live, or noindex everywhere (pre-launch) → measure technique only and say so.

Say the mode and URL in one line.

## 1. Technique

`node ${CLAUDE_SKILL_DIR}/scripts/seo-facts.js <url>` prints JSON: robots.txt, every sitemap it
names (with URL count), and per page (sitemap first, max 10; no sitemap → home and its internal
links): status, redirect, `inSitemap`, title, description, robots meta, `X-Robots-Tag`,
canonical, h1 list, lang, JSON-LD types and parse errors. Read the JSON; don't re-fetch by hand.
Speed only if `npx lighthouse` works: home performance score + LCP/CLS.

| Weight | Findings                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| High   | robots.txt blocks everything, noindex or 4xx/5xx on a page in the sitemap, no working sitemap                                                     |
| Medium | missing or duplicate title/description, no h1, no Organization/LocalBusiness JSON-LD, JSON-LD parse errors, an empty sitemap listed in robots.txt |
| Low    | no canonical, no lang, more than one h1, speed below 80                                                                                           |

## 2. Search data

- **Measure**: a Search Console export from the user (Performance → Export → CSV, last 3 months)
  or a connected SEO tool. Take the top 10 queries (clicks, impressions, CTR, position) and the
  quick wins: pages with impressions at position 5-20.
- **Prospect**: only a connected SEO tool (Semrush, Ahrefs, Ubersuggest, …) → its domain
  overview. Nothing connected → skip, and say so in the report.
- Never estimate a number. No data → "not available".

## 3. Local listing

A business with an address or a service area (not a webshop or online-only) → look it up in
Google Maps in the browser (name + place; decline non-essential cookies): profile or not,
reviews, score, newest review, and its address against the site's. No browser or a bot check →
one AskUserQuestion for the same. Skip otherwise.

## 4. AI answers

Derive 3 prompts in the site's language from what it sells and where: service × region, a
comparison, a problem a customer has (e.g. "Welke bedrijven in <regio> doen <dienst>?").
Default: run each in Perplexity in the browser, without a login
(`perplexity.ai/search?q=<prompt>`, decline non-essential cookies, wait for the full answer),
and note whether the business was named and which competitors were. ChatGPT needs a login:
offer the prompts to the user, each in its own code block to copy whole, and ask only after
they ran them. Stop at any bot check or CAPTCHA, never solve one; fall back to the manual way.
Measure mode reuses the prompts of the previous measurement, so the answers compare.

## 5. Write

**Prospect** → `seo-scan-<domain>-<YYYY-MM-DD>.md` in cwd, from
`${CLAUDE_SKILL_DIR}/references/report.md`, in the site's language. Three things that work,
three biggest opportunities, what a plan would deliver. An opportunity says _what_ is missing
and what it costs the business, never _how_ to fix it: that is the paid plan. Plain words; a
term the reader may not know gets half a sentence of explanation. One page. Offer to publish it
as a shareable page.

**Measure** → a new entry at the top of `## Measurements` in `docs/seo.md`: date, technique
(counts per weight + the high ones by name), search data (key numbers + quick wins), local
(reviews, score), AI (named n/3, competitors named), the prompts used. Compare with the previous
entry: what moved, up or down. Up to 2 concrete points → one line each under `## Later` in
`docs/roadmap.md`; a high finding → a normal roadmap item instead. No roadmap → list them in the
report.

## Report

```
SCAN · <prospect | measure> · <url>
technique  high <n> · medium <n> · low <n>
search     <clicks · impressions · avg position | not available>
local      <reviews · score | none | n/a>
ai         named <n>/3 (<engine>) · instead: <competitors>
written    <file>
next       <send the report | /intake | /seo | /build <slug>>
```

Next: prospect → send the report; measure with an empty `## Intake` → `/intake`; intake done but
no `## Pages` → `/seo`; otherwise the first roadmap item this scan added.
