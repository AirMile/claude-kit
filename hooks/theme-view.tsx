import type { EngineInterface, On, ToolSpec } from "claude-code";

// The theme pane. /theme passes its proposal as data (it is shown in plan mode, before
// anything is written). The mod computes WCAG contrast and returns it to the model. Desktop
// draws an Svg with the real fonts (a glyph subset fetched and embedded: the Svg sandbox
// loads nothing itself); the terminal gets swatches and text.

type Colors = Record<string, string>;
type Font = {
  role: string;
  family: string;
  google?: boolean;
  weights?: number[];
};
type Named = { name: string; px: number };
type Theme = {
  colors: { light: Colors; dark?: Colors };
  fonts?: Font[];
  typeScale?: { step: string; size: number; lineHeight: number }[];
  spacing?: Named[];
  radius?: Named[];
  shadow?: { name: string; value: string }[];
};
type Pair = { fg: string; bg: string; ratio: number | null };

const PANE = "kit-theme";
const SAMPLE = "The quick brown fox jumps";
const BODY = "Body text in the muted role, on the surface.";
const W = 600;
const GREY = "#64748b";
const MONO = "ui-monospace, monospace";

let shown: Theme | null = null;
let svg = "";
const fontCss = new Map<string, string>();

// JSON schema for an array of flat objects: list({ name: "string", px: "number" }).
export const list = (fields: Record<string, string>) => ({
  type: "array",
  items: {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(fields).map(([k, t]) => [
        k,
        t.endsWith("[]")
          ? { type: "array", items: { type: t.slice(0, -2) } }
          : { type: t },
      ]),
    ),
  },
});

export const themeTool: ToolSpec = {
  name: "theme_view",
  description:
    "Show a proposed theme in kit's theme pane and get WCAG contrast for every text pair. " +
    "Colors are semantic roles → hex (#rrggbb): bg, surface, fg, muted, border, primary, " +
    "primary-fg, …; sizes in px. Display only.",
  inputSchema: {
    type: "object",
    required: ["colors"],
    properties: {
      colors: {
        type: "object",
        properties: { light: { type: "object" }, dark: { type: "object" } },
      },
      fonts: list({
        role: "string",
        family: "string",
        google: "boolean",
        weights: "number[]",
      }),
      typeScale: list({ step: "string", size: "number", lineHeight: "number" }),
      spacing: list({ name: "string", px: "number" }),
      radius: list({ name: "string", px: "number" }),
      shadow: list({ name: "string", value: "string" }),
    },
  },
};

// Google Fonts CSS with its files inlined as data URIs (Node 18+ fetch; $.http.fetch is text-only).
const INLINE_FONTS = `(async () => {
  let css = await (await fetch(process.argv[1])).text();
  for (const url of [...new Set(css.match(/https:[^)]+/g) || [])]) {
    const b = Buffer.from(await (await fetch(url)).arrayBuffer()).toString("base64");
    css = css.split(url).join("data:font/ttf;base64," + b);
  }
  process.stdout.write(css);
})().catch((e) => { console.error(String(e)); process.exit(1); })`;

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number | null {
  const [la, lb] = [luminance(a), luminance(b)];
  if (la === null || lb === null) return null;
  return (
    Math.floor(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) /
    100
  );
}

// Text pairs that need 4.5:1: fg and muted on bg and surface, and every `<x>-fg` on `<x>`.
export function pairs(c: Colors): Pair[] {
  const list: [string, string][] = [];
  for (const fg of ["fg", "muted"])
    for (const bg of ["bg", "surface"]) list.push([fg, bg]);
  for (const role of Object.keys(c))
    if (role.endsWith("-fg")) list.push([role, role.slice(0, -3)]);
  return list
    .filter(([fg, bg]) => c[fg] && c[bg])
    .map(([fg, bg]) => ({ fg, bg, ratio: contrast(c[fg] ?? "", c[bg] ?? "") }));
}

const mark = (p: Pair) => (p.ratio === null ? "?" : p.ratio >= 4.5 ? "✓" : "✗");
const esc = (s: string | number) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function embedFonts($: EngineInterface, fonts: Font[]): Promise<string> {
  const glyphs = encodeURIComponent(`${SAMPLE}${BODY}Primary0123456789/`);
  const css: string[] = [];
  for (const font of fonts.filter((f) => f.google !== false).slice(0, 3)) {
    const weights = [...new Set(font.weights ?? [400])]
      .sort((a, b) => a - b)
      .join(";");
    const family = font.family.replace(/ /g, "+");
    const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&text=${glyphs}`;
    if (!fontCss.has(url)) {
      const ran = await $.process
        .run(["node", "-e", INLINE_FONTS, url])
        .catch(() => null);
      fontCss.set(url, ran?.exitCode === 0 ? ran.stdout : "");
    }
    css.push(fontCss.get(url) ?? "");
  }
  const joined = css.join("\n");
  return joined.length < 90_000 ? joined : ""; // the Svg source caps at 131 072 characters
}

// box-shadow "0 4px 12px 0 rgba(…)" → drop-shadow "0 4px 12px rgba(…)" (it has no spread).
function dropShadow(value: string): string {
  const first = value.split(/,(?![^(]*\))/)[0] ?? "";
  const color =
    /(rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8}/i.exec(first)?.[0] ??
    "rgba(0,0,0,.2)";
  return `${first.replace(color, "").trim().split(/\s+/).slice(0, 3).join(" ")} ${color}`;
}

function drawSvg(t: Theme, fontFaces: string): string {
  const fam = (role: RegExp) => {
    const f = t.fonts?.find((x) => role.test(x.role)) ?? t.fonts?.[0];
    return f
      ? `'${esc(f.family)}', system-ui, sans-serif`
      : "system-ui, sans-serif";
  };
  const [head, body] = [fam(/display|head/i), fam(/sans|body|text/i)];
  const out: string[] = [];
  const text = (
    x: number,
    y: number,
    size: number,
    fill: string,
    s: string,
    font = body,
    extra = "",
  ) =>
    out.push(
      `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${esc(fill)}" ${extra}>${esc(s)}</text>`,
    );
  const rect = (x: number, y: number, w: number, h: number, attrs: string) =>
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`);
  let y = 0;
  const title = (s: string) => (
    text(0, (y += 28), 13, GREY, s, body, 'font-weight="700"'),
    (y += 10)
  );

  for (const [mode, c] of [
    ["Light", t.colors.light],
    ["Dark", t.colors.dark],
  ] as const) {
    if (!c) continue;
    title(`${mode} colors`);
    Object.entries(c).forEach(([role, hex], i) => {
      const [x, top] = [(i % 8) * 74, y + Math.floor(i / 8) * 74];
      rect(x, top, 66, 40, `rx="8" fill="${esc(hex)}" stroke="#94a3b844"`);
      text(x, top + 54, 11, GREY, role);
      text(x, top + 66, 10, "#94a3b8", hex, MONO);
    });
    y += Math.ceil(Object.keys(c).length / 8) * 74 + 4;
    text(
      0,
      y,
      11,
      GREY,
      pairs(c)
        .map((p) => `${p.fg}/${p.bg} ${p.ratio ?? "?"} ${mark(p)}`)
        .join("   "),
    );
    const r = t.radius?.find((x) => /md|base/.test(x.name))?.px ?? 10;
    const card = y + 14;
    rect(
      0,
      card,
      W,
      110,
      `rx="${r}" fill="${esc(c.surface ?? c.bg ?? "#fff")}" stroke="${esc(c.border ?? "none")}"`,
    );
    text(20, card + 36, 22, c.fg ?? "#000", SAMPLE, head, 'font-weight="700"');
    text(20, card + 60, 14, c.muted ?? c.fg ?? "#555", BODY);
    rect(
      20,
      card + 72,
      104,
      28,
      `rx="${Math.min(r, 14)}" fill="${esc(c.primary ?? "#333")}"`,
    );
    text(
      72,
      card + 91,
      13,
      c["primary-fg"] ?? "#fff",
      "Primary",
      body,
      'text-anchor="middle" font-weight="600"',
    );
    y = card + 110;
  }
  if (t.typeScale?.length) title("Type scale");
  for (const s of [...(t.typeScale ?? [])].sort((a, b) => b.size - a.size)) {
    const size = Math.min(s.size, 44);
    y += Math.max(s.lineHeight, s.size) * (size / s.size);
    text(0, y, 10, "#94a3b8", `${s.step} ${s.size}/${s.lineHeight}`, MONO);
    text(72, y, size, "#334155", SAMPLE, s.size >= 24 ? head : body);
  }
  if (t.spacing?.length) title("Spacing");
  for (const s of t.spacing ?? []) {
    rect(72, y, Math.min(s.px, W - 80), 12, 'rx="2" fill="#6366f1"');
    text(0, (y += 18) - 8, 10, "#94a3b8", `${s.name} ${s.px}`, MONO);
  }
  const boxes = [
    ...(t.radius ?? []).map((r) => [
      `${r.name} ${r.px}`,
      `rx="${Math.min(r.px, 24)}" fill="#e2e8f0"`,
    ]),
    ...(t.shadow ?? []).map((s) => [
      s.name,
      `rx="8" fill="#fff" style="filter: drop-shadow(${esc(dropShadow(s.value))})"`,
    ]),
  ];
  if (boxes.length) title("Radius · shadow");
  boxes.forEach(([label = "", attrs = ""], i) => {
    const [x, top] = [(i % 6) * 98 + 4, y + 8 + Math.floor(i / 6) * 84];
    rect(x, top, 80, 52, attrs);
    text(x, top + 70, 11, GREY, label);
  });
  y += Math.ceil(boxes.length / 6) * 84 + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="-4 0 ${W + 8} ${y}"><style>${fontFaces}</style>${out.join("")}</svg>`;
}

export function themeView(on: On) {
  on("tool.check", { tool: "mcp__kit__theme_view" }, () => ({
    decision: "allow",
  }));

  on("tool.call", { tool: "mcp__kit__theme_view" }, async ($, e) => {
    const t = e as unknown as Theme;
    if (!t.colors?.light) return { result: "error: colors.light is required" };
    shown = t;
    const isDesktop = (await $.session.surface()) === "desktop";
    svg = isDesktop ? drawSvg(t, await embedFonts($, t.fonts ?? [])) : "";
    const opened = await $.ui.open({ id: PANE, title: "Theme" });
    $.ui.invalidate("ui.render");
    const lines = (["light", "dark"] as const).flatMap((mode) =>
      pairs(t.colors[mode] ?? {}).map(
        (p) => `${mode} ${p.fg}/${p.bg}: ${p.ratio ?? "not hex"} ${mark(p)}`,
      ),
    );
    const pane = opened.isPlaced ? "shown" : `not shown (${opened.reason})`;
    return {
      result: `Theme pane ${pane}. Contrast (min 4.5):\n${lines.join("\n") || "no text pairs"}`,
    };
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    if (!shown)
      return <Text dimColor>Run /theme to preview a theme here.</Text>;
    if (e.surface === "desktop" && svg) {
      const { Svg } = $.ui.resolve(e);
      return (
        <Svg
          source={svg}
          alt="Theme preview: colors, contrast, type, spacing, radius, shadow"
        />
      );
    }
    const t = shown;
    const row = (label: string, items?: string[]) =>
      items?.length ? (
        <Text>
          {label}: {items.join(" · ")}
        </Text>
      ) : null;
    return (
      <Box flexDirection="column">
        {(["light", "dark"] as const).map((mode) =>
          Object.entries(t.colors[mode] ?? {}).map(([role, hex]) => (
            <Text key={`${mode}-${role}`}>
              <Text backgroundColor={hex}>{"    "}</Text> {mode} {role}{" "}
              <Text dimColor>{hex}</Text>
            </Text>
          )),
        )}
        {row(
          "contrast",
          (["light", "dark"] as const).flatMap((m) =>
            pairs(t.colors[m] ?? {}).map(
              (p) => `${m} ${p.fg}/${p.bg} ${p.ratio ?? "?"} ${mark(p)}`,
            ),
          ),
        )}
        {row(
          "fonts",
          t.fonts?.map((f) => `${f.role} ${f.family}`),
        )}
        {row(
          "type",
          t.typeScale?.map((s) => `${s.step} ${s.size}/${s.lineHeight}`),
        )}
        {row(
          "spacing",
          t.spacing?.map(
            (s) =>
              `${s.name} ${"▇".repeat(Math.max(1, Math.min(12, s.px / 4)))} ${s.px}`,
          ),
        )}
        {row(
          "radius",
          t.radius?.map((r) => `${r.name} ${r.px}`),
        )}
      </Box>
    );
  });
}
