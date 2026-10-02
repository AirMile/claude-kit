---
name: theme
description: Create or update the visual theme: colors, fonts, spacing, motion as CSS variables. Use with /theme.
argument-hint: "[brief | image | url | from-code]"
---

# Theme

Gives a project one source of truth for its visual values, in the project's own idiom, so
`/convert`, `/build` and the frontend rule can use tokens instead of raw values.

## 0. Detect

Find existing tokens: Tailwind v4 `@theme` in the global stylesheet, `tailwind.config.*`
`theme.extend`, `:root` CSS variables, or a theme file (`theme.ts`, `tokens.json`). Note the
framework and where the global stylesheet lives.

- Tokens exist → **Update**: ask what should change (one open question) unless the argument says.
- None → **Create**.

## 1. Source

From the argument, or one AskUserQuestion (recommended first):

| Source                           | How                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brief ("calm, trustworthy, B2B") | derive from the brief + `docs/product.md` audience; avoid the generic AI look (Inter/Roboto by default, purple-blue gradients, gradient text) unless asked |
| Image / screenshot               | read it; take dominant colors, font style, density, corner radius                                                                                          |
| URL                              | browser: computed `color`, `background-color`, `font-family`, `font-size`, `border-radius` of key elements                                                 |
| `from-code`                      | grep raw hex/rgb/hsl, px font sizes and spacing in the code; cluster near-duplicates; propose tokens that replace them                                     |

## 2. Propose (plan mode)

`EnterPlanMode`, then draft:

- **Color**: brand + accent, a neutral scale (50 … 950), and semantic roles: `bg`, `surface`,
  `fg`, `muted`, `border`, `primary`, `primary-fg`, `success`, `warning`, `danger`. Dark theme
  values for every semantic role. Neutrals carry a hint of the brand hue (no zero-chroma gray, no
  pure `#000`); dark uses lighter surfaces instead of shadows, accents slightly desaturated.
- **Contrast**: WCAG ratios for every text-on-background pair (fg/bg, muted/bg,
  primary-fg/primary, in both themes), computed, never by eye: the preview tool below returns
  them (no tool → a short `node -e` calculation). Body text ≥ 4.5:1, large text and UI ≥ 3:1.
  Fix failing pairs before showing the plan.
- **Typography**: 1-2 families (Google Fonts or system stack), a type scale (xs … 4xl) with
  line heights; `clamp()` for display sizes.
- **Spacing**: a 4px-based scale; **radius**: 2-4 steps; **shadow**: 2-3 levels.
- **Motion**: durations (fast/base/slow) within 100–250ms (UI never > 300ms), 2 easings
  (`cubic-bezier(0.16, 1, 0.3, 1)`, `cubic-bezier(0.33, 1, 0.68, 1)`), and a
  `prefers-reduced-motion` rule.
- A table of the roles with values and contrast ratios, plus 2-3 lines on the direction (why
  these choices fit the brief/source).

Visual choices are hard to judge as text: call `mcp__kit__theme_view` with the proposal (hex
colors per role for light and dark, fonts with `google: true` for Google Fonts, type scale,
spacing, radius, shadow in px). It shows them in kit's theme pane (real fonts on desktop) and
returns the contrast table; ✗ pairs → adjust and call again. Tool missing (Claude Code before
2.1.287) → the table in the plan is the preview.

`ExitPlanMode`. Reject → revise the plan and preview.

## 3. Write (in the project's idiom)

| Project           | Where                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Tailwind v4       | `@theme { … }` in the global stylesheet, dark values under `.dark` / `prefers-color-scheme` |
| Tailwind v3       | `theme.extend` in `tailwind.config.*` pointing at `:root` CSS variables                     |
| Plain CSS / other | `:root { --… }` in the global stylesheet + a dark block                                     |

- Fonts: load them the framework's way (`next/font`, `@fontsource`, or a `<link>`).
- Update mode: change values in place; never rename a token that code already uses without
  updating its usages.
- `from-code`: replace the raw values with the new tokens only after the user picks
  "Replace now" (AskUserQuestion: Replace now (Recommended) / Later); visual check afterwards.

## 4. Record

- Root `AGENTS.md` → `## Conventions`: one line `Design tokens live in <file>; use them instead
of raw colors, sizes and spacing.` (add once).
- A real direction choice with a rejected alternative → `docs/decisions.md`.

## 5. Verify

Run the dev server (only a server this session started (default port taken → a free one; see `AGENTS.md § Git`); stop only what you started), screenshot 1-2 existing
pages in both themes, check the console. Broken styling → fix before reporting.

## Report

```
THEME · <create | update> · <source>
file       <path>
colors     <n> roles · contrast: all pass (lowest <ratio>)
type       <families> · <n> steps
replaced   <n raw values> (from-code only)
next       /convert or /build
```

Then offer `/commit`.
