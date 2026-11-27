// One usage ring as an SVG, with an arc per plan in a fixed place: Claude outside, ChatGPT
// between, Gemini inside. Pure; band-meters.tsx draws it on the surfaces that have `Svg`.

export const PLANS = ["claude", "gpt", "gemini"] as const;
export type PlanName = (typeof PLANS)[number];
export type Shares = Partial<Record<PlanName, number>>; // percent used

export const PLAN_NAME: Record<PlanName, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
};
export const PLAN_COLOUR: Record<PlanName, string> = {
  claude: "#D97757",
  gpt: "#10A37F",
  gemini: "#4285F4",
};
export const RING_SIZE = 24; // CSS pixels

const RADIUS: Record<PlanName, number> = {
  claude: 10.5,
  gpt: 7.2,
  gemini: 3.9,
};
const MIN_ARC = 1.2; // a little use stays visible, on the small inner arc too

const circle = (r: number, rest: string) =>
  `<circle cx="12" cy="12" r="${r}" fill="none" stroke-width="2.4" ${rest}/>`;

// A plan without a figure (not read, or switched off) keeps its track and draws no arc.
export function ringSvg(shares: Shares): string {
  const arcs = PLANS.map((plan) => {
    const r = RADIUS[plan];
    const track = circle(r, 'stroke="#808080" stroke-opacity="0.3"');
    const pct = shares[plan];
    if (pct === undefined || !(pct > 0)) return track;
    const round = 2 * Math.PI * r;
    const used = Math.min(round, Math.max(MIN_ARC, (pct / 100) * round));
    // An arc always keeps its plan's colour, so the three stay apart when nearly full.
    return (
      track +
      circle(
        r,
        `stroke="${PLAN_COLOUR[plan]}" stroke-dasharray="${used.toFixed(2)} ${round.toFixed(2)}" transform="rotate(-90 12 12)"`,
      )
    );
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${RING_SIZE}" height="${RING_SIZE}">${arcs.join("")}</svg>`;
}
