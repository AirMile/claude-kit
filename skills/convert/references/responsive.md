# Responsive without a mobile frame

Goal: a deliberate layout per width, not the desktop layout stacked into one column. Authority:
a mobile/tablet frame > the site's existing collapse pattern (grep its carousel, tabs and section
components; reuse them with their breakpoints, never a second carousel) > the defaults below.

## Widths

- One row per section at 390 (phone), 768 (tablet, `md`) and ≥1024 (`lg`, the desktop frame).
- Tablet is its own choice per section: never the phone layout stretched, never the desktop grid
  squeezed. A card needs ~280px, so 3-up starts at 1024, not at 768.

## Defaults by content

| Content         | 390                                                | 768                          |
| --------------- | -------------------------------------------------- | ---------------------------- |
| 4+ equal cards  | snap carousel, card ~78% wide, next peeks          | 2-up (same carousel or grid) |
| 3 cards         | snap carousel with peek                            | 2-up, or bento (1 large + 2) |
| steps / process | compact numbered list: number, title, line         | same list                    |
| tabs            | scrollable pill row with an edge fade              | same; panel scrolled in view |
| text + photo    | text first, photo below (aspect-ratio, max-h)      | same, or 2 columns           |
| stats / figures | 2 columns                                          | 2 or 4 columns               |
| table           | scroll with sticky first column, or a card per row | same                         |

From `lg` the frame's grid applies. Steps are never cards or an accordion. Tabs stay tabs (an
accordion swaps the ARIA pattern and adds a second render path); on tap below `lg`, scroll the
panel into view (`block: "nearest"`). Big numerals and display headings scale down below `lg`.

## Rules

- Figma pixel heights apply from `lg`. Below it an image box gets an aspect-ratio or a smaller
  height checked at that width (an aspect-ratio can end up taller); a box holding CMS text gets
  `min-h`, never a fixed height.
- No `whitespace-nowrap` below `lg`.
- Section rhythm comes from the project's shared Section component or spacing token, never px per
  section per breakpoint.
- No information only on hover: under `(hover: none)` it is visible or reachable by tap.
- Touch targets ≥ 24px (WCAG 2.5.8); primary buttons and menu items 44px.
- A stack of equal cards taller than ~1.5 screens at 390 becomes a carousel, a grid or an accordion.
