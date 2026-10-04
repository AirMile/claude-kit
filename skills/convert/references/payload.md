# Payload: make the converted page editable

Goal: agency and client change every text, image, link and list item of the page in `/admin`
without code. Convert does the code side; database writes are a separate, asked step.

## 1. Project recipe first

`AGENTS.md` (root and nested, e.g. next to the block definitions) has an "add a section" recipe
→ follow it; it beats this file where they differ. None → derive one from how an existing
section is wired (step 2), put it in the plan, and save it with `lessons` after the run.

## 2. Find every layer

Grep the slug of a comparable block and each of its `layout`/`variant` values. A section usually
touches: the block schema, the generated types (`generate:types`), the site's page/block type,
the CMS → site mapping, the block → component switch, the content defaults, the seed's mapping,
and a field-usage rule (which fields a layout shows). Every switch must handle the new value: a
missing case usually drops the block silently instead of failing.

## 3. Where the section goes (CMS table in the plan)

One row per section: `section → block (existing · new variant · new) → core | project → fields
→ schema change yes/no`.

- Prefer an existing block with a new `layout`/`variant` option. A new option is an enum
  change, so it is a schema change too.
- A shared core used by several clients (a `core/` folder, a block library passed into a config
  factory) only gets sections that are generic: what it is (cards, steps), not what it's about.
  A section only this design has → a project block in the project's own config.

## 4. Fields

- Everything an editor would change is a field; structure and decoration stay code.
- Build fields with the project's own helpers (role scoping, locked lists, optional-when-empty,
  accent/emphasis text); copy an existing block's shape rather than plain Payload fields.
- Labels, descriptions and tab names in the language of the existing blocks.
- `required` when the design breaks without the value. `maxRows` only where the layout breaks,
  not the item count the frame happens to show.
- Images → the media collection, never `public/` paths. Alt text is a first draft the editors
  must review; the focal point is theirs to set. A file type media rejects (often SVG) or an
  icon set (often a select) → keep it in code and list it under remaining.
- The component gets its content as props from the block data; no literal copy in its JSX.

## 5. Database (separate step, always asked)

Migrations, seed and writing documents change a database other people may use.

- `AGENTS.md` forbids the step here (e.g. migrate only from the main checkout while this is a
  worktree) → write the schema, code and types only; the database step becomes a manual item
  with exact commands (report; inside `/build` a manual item for its step 6).
- Otherwise ask first (AskUserQuestion), naming the host of `DATABASE_URL` (host only, never
  the credentials) and exactly what gets written. Production → never.
- Migration: the project's flow from `AGENTS.md` (create, read the SQL, migrate, generate types,
  commit migration + types together).
- Content: an empty database → the seed. A new page → seed only that page (give the seed
  `--only <slug>` / `--draft` if it lacks them); exit 0 proves nothing: query the slug via the
  local API right after, missing → read why the seed skipped it. A page that already exists →
  never the seed (it overwrites editor changes); add only the new block with a local-API
  script. The ask offers Draft / Publish; a never-published page stays 404 on its live route as
  a draft: say so in the ask, and in the report when a nav link now points to it (production
  links to a 404 until then).
- A local-API script lives as a temp file inside the project (from the scratchpad imports and
  module type don't resolve); delete it afterwards.
- Production: the deploy should create missing pages (build runs the seed with `--missing`:
  create absent pages, never touch existing ones), so a new page ships with its push. No such
  sync → propose it (seed flag + build command + an `AGENTS.md` line; prod secrets stay in the
  host, nobody copies them). After the push, wait for the deploy, then check the live route
  (200) and every image URL. A new block on an existing page stays a manual item: a local-API
  script run with an explicit prod env file (`tsx --env-file=<file>`), deleted after.
- What the CMS already holds beats the frame: report copy differences, don't overwrite them.

## 6. Checks (no database needed)

- Visual verify runs on a temporary dev-only route that renders the site's block components with
  the content-defaults data; delete the route before the commit.
- `generate:types` + typecheck; a fixture case for the new block/variant in the mapping test.
- Robustness: the temporary route also renders the block with optional fields empty, a heading
  twice as long, one item and the most items; one screenshot; overflow or a crash is a finding.
- Grep the component files for distinctive copy from the frame; every hit is a finding (the
  content defaults may hold it, components may not).
- No schema change intended → the migration create command with `--skip-empty` writes no file.
- After the database step (if done): one render of the real page through the CMS. A draft page
  (preview needs a login) → render it in the temporary dev route via the local API
  (`payload.find({ …, draft: true })` → the block mapping), never through `/admin`.
- Manual item for the user: read the page in `/admin` with the client role (tabs, labels, which
  fields show per layout). Never log in or edit in `/admin` yourself: autosave writes to the
  shared database and a second login can end the user's session.
