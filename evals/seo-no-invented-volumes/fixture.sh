#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p docs
printf '# schilder-site\n\n## Commands\n\n- Dev: `npm run dev`\n' > AGENTS.md
cat > docs/product.md <<'MD'
<!-- format: product. Keep under ~60 lines. Product intent only, no implementation detail. -->

# Verfwerk Rijnmond

**What:** Website for a painting company that works for homeowners' associations (VvE's) and housing corporations.
**For whom:** VvE boards and property managers in the Rotterdam region.
**Why now:** Most quote requests come by phone; the site brings in almost nothing.

## Non-goals

- A webshop.
MD
cat > docs/roadmap.md <<'MD'
<!-- format: items under phase (release) headings, one line per item, order = priority.
## v<version> · <name>
- [ ] **slug** · one-line description -->

# Roadmap

## v1 · MVP

- [x] **scaffold** · project skeleton
- [ ] **contact-form** · quote request form
MD
cat > docs/seo.md <<'MD'
<!-- format: seo. Each skill edits only its own section: Intake (/intake), Keywords and Pages
(/seo), Measurements (/scan, newest first). Volumes come from a tool or a CSV, never an
estimate: no source → unknown. -->

# SEO · Verfwerk Rijnmond

## Intake

Asked: 2026-09-01 · Answered: 2026-09-08

### Goal

- What should the site bring in? → Quote requests from VvE boards for exterior painting.

### Customers

- Who searches for you, and who decides? → VvE board members and property managers.
- Which questions do you hear again and again? → How often must a building be repainted? Does a multi-year maintenance plan include painting? Can you work while residents are home?

### Offer

- Which 3 services do you most want to sell? → Exterior painting, wood rot repair, multi-year maintenance plans (MJOP).
- Where do you work? → Rotterdam, Schiedam, Capelle aan den IJssel, Barendrecht.

### Proof

- What shows you're good at it? → Komo-certified, 120 VvE projects since 2015.

### Access

- Search Console, Analytics, Business Profile → open

## Keywords

| term | volume/mo | source | intent | page |
| ---- | --------- | ------ | ------ | ---- |

## Pages

## Measurements
MD
git add -A && git commit -qm init
