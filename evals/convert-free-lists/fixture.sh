#!/usr/bin/env bash
set -euo pipefail
cat > AGENTS.md <<'AGENTS'
# Convert CMS fixture

This case tests the CMS table of the conversion plan, not a full conversion.
Use English for the generated plan.

## CMS

- Blocks live in `cms/blocks/`. Build list fields with `list()` from `cms/blocks/list.ts`.
- Agency and klant fill content in `/admin`; the page structure guard
  (`cms/core/collections/pages.ts`) rejects added or removed rows from non-admins.
AGENTS
cat > package.json <<'PKG'
{
  "name": "fixture",
  "private": true,
  "scripts": { "dev": "next dev", "generate:types": "payload generate:types" },
  "dependencies": { "next": "16.0.0", "react": "19.0.0", "payload": "3.0.0", "tailwindcss": "4.0.0" }
}
PKG
mkdir -p app cms/blocks cms/core/collections
cat > app/globals.css <<'CSS'
@import "tailwindcss";
@theme { --color-brand: #c8102e; --font-sans: "Inter", sans-serif; }
CSS
cat > cms/blocks/list.ts <<'TS'
import type { Field } from "payload";

const LOCKED_ROWS = "/cms/core/components/locked-rows#LockedRows";

/** A list with a fixed structure: only an admin adds, removes or moves rows. */
export function list(name: string, label: string, singular: string, fields: Field[]): Field {
  return {
    name,
    label,
    type: "array",
    labels: { singular, plural: label },
    admin: { initCollapsed: true, components: { Field: LOCKED_ROWS } },
    fields,
  };
}
TS
cat > cms/core/collections/pages.ts <<'TS'
// lockPageStructure: a non-admin update whose row ids/order differ from the stored
// layout (any array of rows with an id, at any depth) throws Forbidden.
export const lockPageStructure = () => {};
TS
cat > figma-read.md <<'FIGMA'
# Figma read (already done)

Frame "Producten - Desktop", 1440px wide. No mobile frame.

1. Catalogue: tabs per product category (Cylindrical Generators, Box Type Generators,
   Fire Extinguishing Units). The first tab shows 3 product cards (photo, name, red
   subheading, 4 spec lines). The client will keep adding products and categories over time.
2. How it works: exactly 4 numbered steps in a row (Detect, Alert, Activate, Extinguish),
   a fixed process the design depends on.
FIGMA
