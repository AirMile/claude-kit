import { expect, test } from "claude-code/testing";

import { ringSvg } from "./band-rings";

// The arcs drawn: radius, colour and drawn length of every circle with a dash.
const arcs = (svg: string) =>
  [
    ...svg.matchAll(
      /r="([\d.]+)"[^>]*?stroke="(#[0-9A-F]{6})"[^>]*?stroke-dasharray="([\d.]+) ([\d.]+)"/g,
    ),
  ].map((m) => ({
    r: Number(m[1]),
    colour: m[2],
    share: Number(m[3]) / Number(m[4]),
  }));

test("one ring holds three arcs: Claude outside, ChatGPT between, Gemini inside", () => {
  const drawn = arcs(ringSvg({ claude: 50, gpt: 25, gemini: 75 }));
  expect(drawn.map((a) => a.colour)).toEqual(["#D97757", "#10A37F", "#4285F4"]);
  expect(drawn[0]!.r > drawn[1]!.r && drawn[1]!.r > drawn[2]!.r).toBe(true);
  expect(drawn.map((a) => Math.round(a.share * 100))).toEqual([50, 25, 75]);
});

test("an unread plan keeps its track and draws no arc, so the others stay in place", () => {
  const svg = ringSvg({ claude: 10, gemini: 20 });
  expect(svg.match(/stroke-opacity/g)).toHaveLength(3);
  expect(arcs(svg).map((a) => a.colour)).toEqual(["#D97757", "#4285F4"]);
  expect(arcs(svg)[1]!.r).toBe(
    arcs(ringSvg({ claude: 10, gpt: 1, gemini: 20 }))[2]!.r,
  );
});

test("an arc keeps its plan's colour when nearly full, is clamped to a full circle, and a little use stays visible", () => {
  const drawn = arcs(ringSvg({ claude: 90, gpt: 140, gemini: 0.4 }));
  expect(drawn.map((a) => a.colour)).toEqual(["#D97757", "#10A37F", "#4285F4"]);
  expect(Math.round(drawn[1]!.share * 100)).toBe(100);
  expect(drawn[2]!.share > 0.04).toBe(true);
  expect(arcs(ringSvg({ claude: 0, gpt: Number.NaN }))).toEqual([]);
});

// A surface draws the SVG as an image: XML without space between two attributes shows broken.
test("the SVG is well-formed: a space separates every attribute", () => {
  const svg = ringSvg({ claude: 50, gpt: 25, gemini: 75 });
  const tags = svg.match(/<[^>]+>/g)!;
  const wellFormed = /^<\/?[a-z]+(\s+[a-zA-Z-]+="[^"<]*")*\s*\/?>$/;
  expect(tags.filter((t) => !wellFormed.test(t))).toEqual([]);
});
