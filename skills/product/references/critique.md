# Critique

Stress-test `docs/product.md` and the roadmap one technique at a time, in dialogue, then turn
the findings into concrete edits. Nothing is written until the user applies them at the end.

## 1. Read and aim

Read product.md, the roadmap, and (when there is code) the README and what is built. Done and
in-progress items are facts to critique _against_, not assumptions to challenge: aim at the open
remainder. Classify the product: **product** (app, service, tool), **creative** (game, story,
interactive piece), or **both**.

## 2. Pick a technique

From the table, keep only what fits this product (its type, and what it actually risks), drop
techniques already applied this session, and rank by which exposes the most serious weakness.
AskUserQuestion with the top 2-3: recommended first, each description one sentence on why it
fits _this_ product (name the item or line it targets).

| Technique         | For      | Core questions                                                                                                   |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Pre-mortem        | all      | A year after launch it failed: tell that story. Single most likely cause? Which warning signs got ignored?       |
| Devil's advocate  | all      | Strongest case against it. Weakest point. Which obstacle is everyone hoping won't show up?                       |
| Assumption test   | all      | What must be true (users, tech, market)? Risk per assumption H/M/L. Cheapest test of the riskiest, before build. |
| Smaller version   | all      | The one hypothesis it stands on. Smallest roadmap that tests it. What is in there because it's fun, not needed?  |
| Alternatives      | all      | 3 other ways to the same goal (simpler, cheaper, an existing tool). Why does this one win?                       |
| Ethics & misuse   | all      | Who could be harmed or excluded? Misuse cases. Privacy and fairness.                                             |
| Audience          | product  | Who exactly, in what situation? Their current workaround. What makes them switch, what stops them?               |
| Gap & competition | product  | What exists, and why isn't it enough? The one differentiator. How would a competitor respond?                    |
| Feasibility       | product  | Hardest parts (tech, data, cost, time for this team). Blockers. Look libraries up with context7, don't guess.    |
| User journey      | both     | First visit → first value → return. Where does it confuse, stall or lose them? Where is the delight?             |
| Monetization      | product  | Only when it must earn: what would they pay for, which model, what does one user cost?                           |
| Core loop         | creative | The action repeated most, in one sentence. Fun without rewards? Where does it wear thin? Features that dilute?   |
| Theme & story     | creative | Core theme or arc. Does the execution carry it, or contradict it? Pacing, holes.                                 |
| Scale & content   | creative | How much content does it need? Can this team make it? Does the core stay interesting at scale?                   |

## 3. Apply it

Present (in the user's language):

```
🔍 <Technique>
<1-2 sentences: what it does, why here>

Questions:
1. <4-6 questions, each anchored in a concrete line of product.md or a roadmap item>

Points of attention:
1. <3 concrete weaknesses you already see, with the item they hit>

Answer by number or in your own words.
```

Then dialogue: wait for the answer, no AskUserQuestion in between. Be rigorous: name real
problems, push back on soft answers, ask for a decision. When a question has ≤ 3 plausible
answers (which risk first, keep or cut an item, A vs B), ask it as AskUserQuestion, your
hypothesis first; a choice between designs gets a short trade-off table before it. Technical
doubt (can library X do Y?) → look it up with context7 first and fold the finding into the
question. Stop when the technique has nothing new to give.

## 4. Synthesize

```
📋 <Technique>
Problems          <specific, with the item or line they hit>
Weak assumptions  <which, and how to test them>
Improvements      <concrete changes>
```

## 5. Next

Re-rank what's left. AskUserQuestion: **Turn into edits (Recommended)** or the 1-2 most relevant
remaining techniques (after two, returns usually drop). Nothing relevant left → say so and go on.

## 6. Turn into edits

Collect the findings from all applied techniques into concrete changes: product.md (sharper
**For whom**, a new **Non-goal**, an **Open question** that needs a real-world test) and the
roadmap (cut, split, reorder, move to `## Later`, add a missing item). Apply them through
**Update** steps 2-4 of `SKILL.md` (diff, show, one confirmation). The user may also keep
everything as is; the critique then stays in the conversation only.
