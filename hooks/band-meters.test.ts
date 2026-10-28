import { expect, test } from "claude-code/testing";

import { meterRows } from "./band-meters";

const u = (label: string, value: string, note?: string) => ({
  label,
  value,
  note,
  pct: Number.parseInt(value, 10),
});

test("each window pairs Claude's share with ChatGPT's", () => {
  const rows = meterRows([
    u("ctx", "240k"),
    u("5h", "30%", "3h29m"),
    u("wk", "21%", "5d22h"),
    u("gpt 5h", "2%", "4h12m"),
    u("gpt wk", "1%", "6d23h"),
  ]);
  expect(rows.map((r) => [r.label, r.claude?.value, r.gpt?.value])).toEqual([
    ["5h", "30%", "2%"],
    ["wk", "21%", "1%"],
  ]);
});

test("with GPT off or unread only Claude shows; a window nobody reported is left out", () => {
  const rows = meterRows([u("5h", "30%", "3h29m")]);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.gpt).toBeUndefined();
  expect(meterRows([])).toEqual([]);
});

test("with GPT off its shares are left out, even while still in the usage", () => {
  const rows = meterRows([u("5h", "30%", "3h29m"), u("gpt 5h", "2%", "4h12m")], false);
  expect(rows.map((r) => [r.label, r.claude?.value, r.gpt])).toEqual([
    ["5h", "30%", undefined],
  ]);
  expect(meterRows([u("gpt wk", "1%")], false)).toEqual([]);
});
