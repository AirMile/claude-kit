---
paths:
  - "**/*.{tsx,jsx,vue,svelte,astro,html,css,scss}"
---

# Frontend edit rules

- **Simplest CSS first**: pick one approach, apply it, let the user judge. No trial-and-error loops.
- **Use the project's tokens**: before an arbitrary value (`#hex`, `13px`, `w-[317px]`), look for an
  existing CSS variable, `@theme` value or Tailwind token and use that.
- **Verify data first**: before building UI on a data source, read its actual shape.
- **Check structural edits in the browser**: after layout, positioning or responsive changes, take
  a screenshot of the running page and look at it. Skip for purely cosmetic edits.
- **Screenshot from the user + edit request**: screenshot the current state yourself, compare,
  edit, screenshot again.
- **Pasted element refs** (e.g. `[src/components/Button.tsx:42 …]` or `[button.icon-btn …]` from an
  inspect overlay): open that exact file and line or selector and edit there; don't search for a
  similar element elsewhere.
- **Dev server**: only use one this session started; default port taken → a free one via
  `PORT`, with the app's URL variables pointed at it (another port may serve another session's
  code). Stop only processes you started.
