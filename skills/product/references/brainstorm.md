# Brainstorm

Explore new directions for the product one technique at a time, in dialogue, then pick which
ideas land on the roadmap. Nothing is written until the user picks at the end.

## 1. Read and aim

Read product.md, the roadmap (incl. `## Later`) and, when there is code, what is built. Built
and planned items are known ground: look for the gaps around them. Every idea must serve **For
whom** and **Core experience**; one that crosses a **Non-goal** is only worth raising as a
deliberate challenge to that non-goal, labelled as such.

## 2. Pick a technique

From the table, rank by which opens the most unexplored ground for _this_ product; drop
techniques already applied this session. AskUserQuestion with the top 2-3: recommended first,
each description one sentence on why it fits here.

| Technique         | Generates by                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| What if           | Provocations: what if it were free, offline, social, for kids, 10× faster, from 1995 or 2035?                |
| Analogy           | Borrowing: how do games, a shop, a hospital, a sport solve the same moment? Map one domain deeply.           |
| Reversal          | Flipping: the opposite of each core assumption; the user does the work, or the product does it all.          |
| SCAMPER           | Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse: one pass per letter over the core. |
| Role play         | Stakeholders: a beginner, a power user, someone who quit, an admin, a parent. What does each one miss?       |
| Journey gaps      | Moments: before first use, first win, a bad day, coming back after a month, telling a friend.                |
| Five whys         | Motivation: why the user really comes, five levels deep; features for the root, not the surface.             |
| Constraints       | Pressure: one screen only, one day to build, no accounts, no text. What survives is the core.                |
| Combinations      | Parameters: list 3-4 dimensions (who, when, device, format), mix values nobody has tried.                    |
| Yes, and          | Building: take the strongest idea so far, extend it three generations, keep the best branch.                 |
| Random stimulus   | Breaking patterns: a random word or object, forced into a connection with the product.                       |
| Question storming | Reframing: only questions about the problem for a round, then pick the one worth answering.                  |

## 3. Apply it

Present (in the user's language):

```
🎨 <Technique>
<1-2 sentences: what it does, why here>

Questions:
1. <4-6 questions, each anchored in a concrete line of product.md or a roadmap item>

Ideas to start with:
- <2-3 concrete, unexpected ideas this technique produces for this product>

Answer by number or in your own words.
```

Then dialogue: wait for the answer, no AskUserQuestion in between. Be curious and push past the
obvious: wild first, filter later; concrete variants over vague "what ifs". When the user has to
pick between generated variants ("which of these do we deepen?"), ask it as AskUserQuestion;
a choice between designs gets a short trade-off table before it. Technical question (can
library X do Y?) → context7 first. Stop when the technique has nothing new to give.

## 4. Synthesize

```
📋 <Technique>
Ideas        <each: slug-ready name · one line · who it serves>
Directions   <bigger themes worth a later round or a phase>
Insights     <what this taught about the product itself>
```

## 5. Next

Re-rank what's left. AskUserQuestion: **Pick ideas (Recommended)** or the 1-2 most relevant
remaining techniques (after two, returns usually drop). Nothing relevant left → say so and go on.

## 6. Pick and place

Filter all ideas against the roadmap and `## Later` (no duplicates) and the roadmap rules in
`SKILL.md` (one `/build` run each; too big → split). AskUserQuestion (multiSelect, max 4 per
question, strongest first) which to add; per idea a description saying where it goes (phase or
`## Later`) and why. An insight that changes product.md (a sharper **Core experience**, a
challenged **Non-goal**) is offered as its own option. Apply the picks through **Update** steps
2-4 of `SKILL.md`.
