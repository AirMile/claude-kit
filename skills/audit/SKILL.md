---
name: audit
description: Audit a whole site before delivery: errors, links, mobile, accessibility, SEO, images. Use with /audit.
argument-hint: "[url | nothing for the local app]"
---

# Audit

A sweep over every page of a site, for the moments a feature-level verify doesn't cover:
before delivering to a client, before a launch, or after a big change. Small findings get fixed,
the rest lands on the roadmap.

## 0. Target and pages

- **Target**: a URL argument (staging or production), else the local app. Local → prefer a
  production build (`build` + `start` from `AGENTS.md`) over the dev server, since dev mode
  distorts errors and speed. Use only a server this session started (free port when the
  default is taken); stop only what you started. Your own dev server in this folder → stop it
  before `build` (Next.js ≤ 15 shares the output dir: the dev page silently stops hydrating).
- **Pages**: `sitemap.xml` → else follow internal links from the home page (max 30) → else the
  routes on disk (`app/`, `pages/`, `src/routes/`). Dynamic routes: one example each.

Say the page count and target in one line before starting.

## 1. Check every page

Open each page in the browser at 1280px, scroll to the bottom once (scroll-triggered content),
then evaluate `${CLAUDE_SKILL_DIR}/references/page-check.js` in the page (it returns JSON: title,
description, h1 count, lang, canonical, og:image, images without alt or oversized, inputs without
label, horizontal overflow, link list). Also collect console errors (minus extension, HMR and
favicon noise) and failed requests (4xx/5xx).

Then, per page:

- **Mobile**: resize to 375px, re-run the script, note overflow and text that becomes unreadable;
  screenshot only pages with problems.
- **Accessibility**: inject axe-core
  (`https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js`) and run `axe.run()`;
  keep `critical` and `serious` violations.

Once for the whole site:

- **Links**: `curl -s -o /dev/null -w "%{http_code}"` every unique internal link → list non-2xx.
- **Speed** (only if `npx lighthouse` works): performance score + LCP/CLS for the home page and
  the heaviest page.
- **404**: a non-existent route → the app's own 404 page with a link home.
- **Raw HTML**: `curl` the home + one content page → the h1 text is in the served HTML.
- **Crawl basics**: `robots.txt` reachable; JSON-LD present on the home page.
- **Dark mode / reduced motion** (only when the browser tool can emulate media): identical
  screenshots, or animations still running → finding.

## 2. Findings

| Severity   | Examples                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker    | console errors, broken links, failed requests, critical axe violations, mobile overflow                                                              |
| Should fix | missing title/description, missing alt, unlabeled inputs, serious axe violations, images > 300 KB, no og:image, no own 404, h1 missing from raw HTML |
| Nice       | duplicate titles, h1 count ≠ 1, missing canonical, speed below 80, no robots.txt/JSON-LD, dark mode/reduced motion ignored                           |

Group identical findings across pages (one line, page count), don't list them per page.

## 3. Fix or park

AskUserQuestion (multiSelect): which groups to fix now. Recommend the small, safe ones: alt
texts written from context, meta via the framework's metadata API, labels, image sizes/formats.
Fix them, then re-check only the affected pages.

The rest → one line per group under `## Later` in `docs/roadmap.md` (or a normal roadmap item
when it's a blocker the user chose not to fix now).

## Report

```
AUDIT · <target> · <n> pages
blocker    <n> (<fixed n>)
should     <n> (<fixed n>)
nice       <n>
parked     <n> lines in docs/roadmap.md
mobile     <ok | n pages with issues>
speed      <score or —>
```

Offer to save the report as `docs/audits/YYYY-MM-DD.md` (useful to show a client what was
checked), then `/commit` for the fixes.
