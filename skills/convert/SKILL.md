---
name: convert
description: Turn a sketch, screenshot, Figma frame or URL into working UI code. Use with /convert.
argument-hint: "[image path | figma url | site url] [target page/component]"
---

# Convert

Visual input → code in the project's stack and tokens, verified against the source in the
browser. Standalone it ends with a commit; inside `/build` (spec has `Design:`) it is the build
procedure for the UI part and build handles verify and commit.

## 1. Input

Resolve the source (ask once if nothing was given):

| Source                      | How to read it                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Image / screenshot / sketch | `Read` the file                                                                                      |
| Figma URL                   | Figma MCP: `get_design_context` + `get_variable_defs` + `get_screenshot` for the node                |
| Live URL                    | Browser: full-page screenshot + computed styles of key elements (colors, fonts, spacing per section) |

Figma: a sparse (outline-only) `get_design_context` → call it per visible child node; never one
call for a multi-section frame. Figma MCP missing → AskUserQuestion: Reconnect via `/mcp`
(Recommended) / an exported frame PNG.

Then the target: which page/route or component file. Existing file → this is a **patch**: keep
everything the source does not show (data fetching, props, handlers, copy that's real).

## 2. Mode

Pick from the source and ask only when ambiguous (AskUserQuestion, recommended first):

- **Sketch → hi-fi**: wireframe or rough mock. Take layout from the source; take colors,
  spacing and type from the project's tokens. Never copy raw values from a sketch.
- **1:1 copy**: a finished design (Figma, screenshot of a real UI). Match values exactly; map
  each to the nearest existing token, and only use an arbitrary value when no token matches.
- **Inspiration**: "make it like this". Borrow structure and feel; everything visual from tokens.

## 3. Tokens

Find the project's design tokens: CSS variables in the global stylesheet (`:root` / `@theme`),
the Tailwind config, or a theme file. None exist → recommend running `/theme` with this source
first (AskUserQuestion: Run /theme first (Recommended) / Derive a minimal set here). Minimal
set = colors, font families, a spacing scale and radii as CSS variables in the global
stylesheet; say what you added.

## 4. Plan (plan mode)

`EnterPlanMode`, then write a short plan:

- **Sections**: the page split top to bottom, with the component per section (reuse existing
  components first; grep before creating).
- **Mapping table** per category: `source value → token` (1:1 copy: one row per section for
  spacing; per color segment of a heading also weight/italic; one line-count row per heading;
  overlaps, fixed heights and aspect ratios exact). An accent font on one word of a Figma
  heading is usually emphasis → reuse the codebase's accent pattern before adding a font.
- **Assets**: which images/icons come from the source (exported files, never redrawn), which
  stay props/data. Figma's `localhost` asset URLs die when Figma closes → download them in this
  run. SVGs stay files: never inline, redraw or swap for a library icon.
- **Responsive**: how the layout collapses at mobile width.

`ExitPlanMode`. Reject → adjust.

## 5. Build

- Layout with flex/grid + gap; never absolute positioning copied from Figma coordinates, except
  for real overlap (badge on a card, layered media).
- Semantic HTML, alt text, labelled controls, visible focus states.
- Copy: real text from the source or `docs/product.md`; never lorem ipsum.
- Assets go in the slot the plan names, as exported files with their own aspect ratio.

## 6. Verify (max 3 rounds)

Dev server: only a server this session started (default port taken → a free one; see `AGENTS.md § Git`). Stop only what you started.

Each round:

1. Scroll top to bottom once, then screenshot the result at the source's width; `Read` it next
   to the source.
2. Console errors → fix first.
3. List discrepancies, fix in order: layout/structure → spacing/sizing → colors/details.
4. 1:1 copy with a Figma/URL source → also compare computed values of key elements against the
   source values from step 1; any mismatch is a finding.

After the loop: check 390 / 768 / 1440px: no horizontal overflow (`scrollWidth ===
clientWidth`), readable text, breakpoint switches visible.

Stop when no significant discrepancies remain or after round 3 (list what's left).

## 7. Refine and finish

Show the final screenshot; AskUserQuestion: Looks right (Recommended) / Adjust (describe).
Adjust → targeted edit + re-screenshot, repeat.

Standalone → `lessons` if a non-obvious convention surfaced, then `commit`. Inside `/build` →
return to build's step 4b.

## Report

```
CONVERT · <mode> · <source>
target   <file(s)>
tokens   <reused n · added n>
rounds   <n> · remaining: <issues or none>
widths   <ok | issues at 390, 768, 1440>
```
