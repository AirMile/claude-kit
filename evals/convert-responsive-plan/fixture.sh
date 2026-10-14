#!/usr/bin/env bash
set -euo pipefail
cat > AGENTS.md <<'AGENTS'
# Convert plan fixture

This case tests the conversion plan for a desktop-only design, not a full conversion.
Use English for the generated plan.
AGENTS
cat > package.json <<'PKG'
{
  "name": "fixture",
  "private": true,
  "scripts": { "dev": "next dev" },
  "dependencies": { "next": "16.0.0", "react": "19.0.0", "tailwindcss": "4.0.0" }
}
PKG
mkdir -p app
cat > app/globals.css <<'CSS'
@import "tailwindcss";
@theme {
  --color-brand: #c8102e;
  --font-sans: "Inter", sans-serif;
}
CSS
cat > figma-read.md <<'FIGMA'
# Figma read (already done)

Frame "Home – Desktop", 1440px wide. The Figma page has no mobile or tablet frame.

1. Hero: heading + intro text left, photo right in a fixed box 640px tall.
2. Services: 4 equal cards in one row, each 520px tall, photo + title + one paragraph.
3. Process: 5 steps in one horizontal row, numbered circles connected by a line.
4. Figures: 4 stats in one row, numerals 96px.
5. Testimonials: 3 quote cards in one row, each 360px tall with CMS-editable text.
FIGMA
