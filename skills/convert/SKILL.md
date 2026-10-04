---
name: convert
description: Turn a Figma frame into working UI code, wired to the project's Payload CMS when it has one. Use with /convert.
argument-hint: "[figma url | exported frame png] [target page/component]"
---

# Convert

Figma frame → code in the project's stack and tokens, verified against the frame in the browser.
Standalone it ends with a commit; inside `/build` (spec has `Design:`) it is the build procedure
for the UI part and build handles verify and commit.

## 1. Input

The source is a Figma URL with a `node-id` (ask once if none was given). Read it with the Figma MCP:

- `get_metadata` on the frame → the section split and each section's node id.
- Per section: `get_design_context` + `get_variable_defs` + `get_screenshot`. Never one call for a
  multi-section frame. The returned code is a reference to adapt, not code to paste.
- `get_code_connect_map` → sections already mapped to a component: reuse that component.
- `get_motion_context` (recursive) when the frame has prototype interactions or animated variants.
- Other frames of the same page exist (check the frame names on its Figma page; a large
  `get_metadata` result is saved to a file → regex the top-level frames) → read them too: a
  mobile frame decides the collapse, a state frame (another tab, year, step) gives its content.
  State frames that only change content → one read-only `use_figma` dump of text + fills
  across all of them (load `/figma-use` first), not `get_design_context` per frame. Map a
  state frame to its item by position, not by its text (duplicated frames keep stale names
  and copy); flag a copy mismatch in the report.

Figma MCP missing → AskUserQuestion: Reconnect via `/mcp` (Recommended) / an exported frame PNG
(`Read` it; every value from it is `estimated` in the report).

Then the target: which page/route or component file. Existing file → this is a **patch**: keep
everything the frame does not show (data fetching, props, handlers, copy that's real). A
component shared by several pages → name those pages in the plan; they change too.
A frame that only adds content to a converted section (another tab, state or item) → content
patch: fill the existing props/CMS defaults, skip steps 2, 3 and 5; verify that section only.

## 2. Fidelity and motion

- **1:1**: match the frame's values; map each to the nearest existing token, and only use an
  arbitrary value when no token matches. A site-wide layout token (container max, gutter,
  breakpoint) beats a conflicting frame value: keep the token, note the gap in the mapping table.
- **Motion**: only what Figma defines (variants, prototype interactions, motion context). One row
  per effect: element · trigger (hover, press, focus, scroll-into-view) · effect · timing, with the
  computed value to expect. Always honour `prefers-reduced-motion`. Motion the frame doesn't define
  is a separate `/build` item, not part of the convert.

## 3. Tokens

Find the project's design tokens: CSS variables in the global stylesheet (`:root` / `@theme`),
the Tailwind config, or a theme file. None exist → recommend running `/theme` with this frame
first (AskUserQuestion: Run /theme first (Recommended) / Derive a minimal set here). Minimal
set = colors, font families, a spacing scale and radii as CSS variables in the global
stylesheet; say what you added.

## 4. CMS

`payload` in `package.json` → read `${CLAUDE_SKILL_DIR}/references/payload.md` now and apply it in
the plan, build and verify steps below. No Payload → components take their content as props;
copy comes from the frame or `docs/product.md`.

## 5. Plan (plan mode)

Inside `/build` the spec's Approach already holds the sections and the CMS table: no plan mode;
write the mapping, motion and asset tables below in the chat, then build. Standalone:
`EnterPlanMode`, then write a short plan:

- **Sections**: the page split top to bottom, with the component per section (reuse existing
  components first; grep before creating).
- **Mapping table** per category: `figma value → token` (one row per section for spacing; per
  color segment of a heading also weight/italic; one line-count row per heading; overlaps, fixed
  heights and aspect ratios exact). An accent font on one word of a heading is usually emphasis
  → reuse the codebase's accent pattern before adding a font.
- **Motion table** from step 2 (or "none").
- **Assets**: which images/icons come from the frame (exported files, never redrawn), which stay
  props/data. Asset URLs from the MCP are temporary → download them in this run
  (`download_assets` for any the design context didn't give). SVGs stay files: never inline,
  redraw or swap for a library icon, unless the layer names an icon of the library the project
  already uses (e.g. `lucide/arrow-right`): then use that library's component.
- **Responsive**: the mobile frame's layout, or how the layout collapses when there is none.
- **CMS table** when `payload.md` applies.

`ExitPlanMode`. Reject → adjust.

## 6. Build

- Layout with flex/grid + gap; never absolute positioning copied from Figma coordinates, except
  for real overlap (badge on a card, layered media).
- Semantic HTML, alt text, labelled controls, visible focus states.
- Copy: real text from the frame; never lorem ipsum.
- Assets go in the slot the plan names, as exported files with their own aspect ratio.

## 7. Verify (max 3 rounds)

Dev server: only a server this session started (default port taken → a free one; see
`AGENTS.md § Git`). Stop only what you started. A second dev server is refused (Next 16+,
one per dir) → AskUserQuestion: use the running one read-only (Recommended) / stop it first.

Each round:

1. Scroll top to bottom once, then screenshot the result at the frame's width; `Read` it next
   to the frame screenshot.
2. Console errors → fix first.
3. List discrepancies, fix in order: layout/structure → spacing/sizing → colors/details.
4. Compare computed values of key elements against the Figma values from step 1; any mismatch
   is a finding (skip for a PNG source).
5. Motion rows: trigger the state headless (a hidden pane freezes transitions): Playwright MCP;
   "Browser is already in use" → a scratch Node script on the project's `playwright` package.
   Compare computed `transform`/`opacity`/`transition` (or `element.getAnimations()`) against
   the expected value; a screenshot doesn't prove motion.

After the loop: check 390 / 768 / 1440px: no horizontal overflow (`scrollWidth ===
clientWidth`), readable text, breakpoint switches visible.

Stop when no significant discrepancies remain or after round 3 (list what's left).

## 8. Refine and finish

Open the page in the browser pane when the session has one (`preview_start` the dev server,
`navigate` to the route; Payload: the temporary dev route, kept until approval) so the user can
scroll and click. No pane, or it can't reach the server (e.g. the read-only one) → send the
final screenshot and the frame's with `SendUserFile`. AskUserQuestion: Looks right
(Recommended) / Adjust (describe).
Adjust → targeted edit + re-screenshot, repeat.

Standalone → `lessons` if a non-obvious convention surfaced, then `commit`. Inside `/build` →
return to build's step 4b.

## Report

```
CONVERT · <figma | png (estimated)> · <frame name>
target   <file(s)>
tokens   <reused n · added n>
motion   <n rows verified | none>
cms      <reused n · variants n · new n (core|project) · db done|handed off|none · prod pending|n/a>
rounds   <n> · remaining: <issues or none>
widths   <ok | issues at 390, 768, 1440>
```
