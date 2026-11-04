#!/usr/bin/env bash
set -euo pipefail
cat > AGENTS.md <<'AGENTS'
# Convert CMS fixture

This case tests the CMS table of the conversion plan, not a full conversion.
Use English for the generated plan.

## CMS

- Add a section = a block in `cms/blocks/`. Build fields only with the helpers: `list()`,
  `itemsSource()`, `sectionFields()`, `cta()`.
- Per list decide `free` (editors add/remove rows) or `locked`. A free plain list is
  `list(name, label, singular, fields, true)`; its name goes in `FREE_LISTS`
  (`cms/core/collections/pages.ts`), scoped to its block type.
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
mkdir -p app cms/blocks cms/core/collections cms/core/fields
cat > app/globals.css <<'CSS'
@import "tailwindcss";
@theme { --color-brand: #c8102e; --font-sans: "Inter", sans-serif; }
CSS
cat > cms/blocks/list.ts <<'TS'
import type { Field } from "payload";

const LOCKED_ROWS = "/cms/core/components/locked-rows#LockedRows";

/** A list with a fixed structure: only an admin adds, removes or moves rows. */
export function list(
  name: string,
  label: string,
  singular: string,
  fields: Field[],
  free = false,
): Field {
  return {
    name,
    label,
    type: "array",
    labels: { singular, plural: label },
    admin: free ? { initCollapsed: true } : { initCollapsed: true, components: { Field: LOCKED_ROWS } },
    fields,
  };
}
TS
cat > cms/core/fields/items.ts <<'TS'
import type { Field } from "payload";

const LOCKED_ROWS = "/cms/core/components/locked-rows#LockedRows";

/**
 * Own items (rows in the section) or a shared collection (managed once, equal everywhere).
 * The own-items array is always locked: only an admin adds, removes or moves rows.
 */
export function itemsSource(opts: { items: string; shared: string; fields: Field[] }): Field[] {
  return [
    {
      name: "source",
      type: "radio",
      defaultValue: "own",
      options: ["own", "shared"],
    },
    {
      name: opts.items,
      type: "array",
      admin: { initCollapsed: true, components: { Field: LOCKED_ROWS } },
      fields: opts.fields,
    },
    { name: opts.shared, type: "relationship", relationTo: "questions", hasMany: true },
  ];
}
TS
cat > cms/core/collections/pages.ts <<'TS'
// lockPageStructure: a non-admin update whose row ids/order differ from the stored
// layout (any array of rows with an id, at any depth) throws Forbidden.
export const lockPageStructure = () => {};
TS
cat > figma-read.md <<'FIGMA'
# Figma read (already done)

Frame "Veelgestelde vragen - Desktop", 1440px wide. No mobile frame.

1. FAQ: a heading and an accordion with 3 questions (each a question and an answer). Copy
   comes from the client and changes over time: questions get added, reworded and dropped.
2. How it works: exactly 4 numbered steps in a row (Detect, Alert, Activate, Extinguish),
   a fixed process the design depends on.
FIGMA
