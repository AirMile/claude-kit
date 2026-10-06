---
name: seo
description: Plan search terms and pages from the intake and real search data, onto the roadmap. Use with /seo.
argument-hint: "[nothing | path to a keyword or Search Console CSV]"
---

# SEO

Turns the intake and real search data into a plan: which terms matter, which page answers each,
and what goes on the roadmap for `/build`. Rerun it any time (quarterly, a new service): it
never repeats the intake, and it reads the measurements to see what to improve first.

Order for a client: `/scan` (baseline) → `/intake` (once) → `/seo` → `/build` per page →
`/audit` → `/launch` → `/scan` monthly. A new site: `/setup` and `/product` first, so the page
plan decides which pages and URLs get built.

## 0. Preconditions

- Not a kit project, or no `docs/roadmap.md` → stop: `/setup` (and `/product` for a new site).
- No `docs/seo.md`, or `## Intake` without answers → stop: `/intake` first.
- Goal, main services or region still `open` → stop and name them. Other open answers become
  assumptions, marked `(assumed)` where they are used.

## 1. Candidate terms

From the intake (services × the customers' own words × region, the questions they hear on the
phone), the site's copy, and the titles and h1s of the competitors below (WebFetch). Write
them as people type them, in the site's language. 20-60 terms; a customer question is a term.

**Who ranks**: search the 3-5 main terms in the browser on Google (the site's country, e.g.
google.nl) and Bing (`cc=<country>`), one search at a time, declining non-essential cookies.
Stop at any bot check or CAPTCHA, never solve one; no browser → WebSearch. Domains that recur
in the top 10 are the search competitors (they may differ from the intake's); note per term
which page type wins (service page, guide, directory, Maps pack).

## 2. Volumes

The first source that works:

1. A connected SEO tool (Semrush, Ahrefs, Ubersuggest, …): monthly volume for the country.
2. A CSV from the user (the arg, or ask once): a Google Keyword Planner export (search volume
   for the candidate terms) or a Search Console queries export (impressions).
3. Nothing → volume `unknown`, source `—`.

**Never estimate or invent a number**, not even "about". A term without data stays `unknown`;
the plan then ranks by intent and the client's priorities, and the report says so.

## 3. Pages

- Group terms by intent: hire/buy, compare, learn, local. One group → one page with one main
  term; supporting terms go on that page, never a page per synonym.
- Build the page type that wins the term in `## Competitors`; a term only directories or the
  Maps pack win → the listing (`/scan`), not a new page.
- An existing page that is about it gets the term; a new page only when none fits.
- No page per place name unless the business really has a location or works there and the page
  has content of its own: city pages that funnel to one page are doorway abuse in Google's spam
  policies.
- Per page: 3-5 questions it answers directly (from the intake and the learn terms), the schema
  types from `${CLAUDE_SKILL_DIR}/references/schema.md`, internal links to related pages.
- Moving from an old site → `from:` lists the old URLs that must redirect to this page.

## 4. Write

1. `docs/seo.md` (format below): replace `## Competitors`, `## Keywords` and `## Pages` entirely, leave
   `## Intake` and `## Measurements` as they are. Write it without asking: the plan is the file.
2. Roadmap: one item per new page (`- [ ] **<slug>** · SEO page for "<main term>"`) and per
   existing page that needs rework (`· rework for "<term>"`), in the first phase with open
   items. An open item for that page already exists → append ` (seo: <term>)` to its
   description instead. Never touch `[x]` items or items in progress (spec link). Show the diff,
   one confirmation (Apply (Recommended) / Adjust), write.

## Rerun

With measurements: first the pages with impressions at position 5-20 (closest to page one), then
terms with volume but no page. Keep slugs stable; a page whose main term changes → rework item.

## Format

`docs/seo.md` (`/scan` and `/intake` copy this header and the empty sections when they create
it):

```markdown
<!-- format: seo. Each skill edits only its own section: Intake (/intake), Competitors, Keywords
and Pages (/seo), Measurements (/scan, newest first). Volumes come from a tool or a CSV, never an
estimate: no source → unknown. -->

# SEO · <site>

## Intake

Asked: <date> · Answered: <date | —>

### Goal

- <question> → <answer | open>

## Competitors

Searched: <date> · <engines>

- <main term> → <top domains in order> · wins: <page type>

## Keywords

| term | volume/mo | source | intent | page |
| ---- | --------- | ------ | ------ | ---- |

## Pages

- **<slug>** · /<path> · term: <main term> · also: <supporting terms>
  - questions: <3-5 questions the page answers>
  - schema: <types> · links: <slugs> · from: <old URLs | —>

## Measurements
```

## Report

```
SEO · <first plan | rerun>
terms      <n> · with volume <n> (<source>) · unknown <n>
competitors <recurring domains | —>
pages      <n> existing · <n> new · <n> rework
roadmap    <n> items added · next: /build <slug>
assumed    <open intake answers used as assumptions | —>
```
