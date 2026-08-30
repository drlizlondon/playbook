---
name: marketing-angles
description: Find the strongest marketing angles to test with an audience right now, grounded in what people actually say. Researches real customer language from any source (forums, reviews, support tickets, sales calls, search data, interviews), clusters it into themes with provenance and counter-signals, ranks angles by evidence rather than repetition, and writes hooks under each one. Trigger with "run marketing angles for [product]", "what angles should we test", "marketing angles", "find our positioning angles", "what do customers actually say about [product]", "give me hooks to test", or when someone needs ad/landing-page/reel messaging grounded in evidence instead of invention.
---

# Marketing angles

Produce a ranked, evidence-backed set of **marketing angles** and the **hooks** to test underneath them, for any product and audience, from any evidence source.

The chain is four layers and they are never collapsed:

```
signals  →  themes  →  angles  →  hooks
```

- A **signal** is one observed piece of evidence, with a URL and a date.
- A **theme** is a cluster of signals plus a counter-signal.
- An **angle** is a positioning claim resting on one or more themes.
- A **hook** is one expression of an angle. One angle should yield several.

Worked example:

| Layer | Example |
|---|---|
| Theme | People keep trying AI tools but never build them into a routine. |
| Angle | The problem isn't finding another AI tool. It's making one actually stick. |
| Hook | "Twelve AI tools. Zero habits." |

## The one rule that matters

**Repetition is not prevalence.** Ten people in a forum saying the same thing tells you how the problem is *described*. It does not tell you how *common* the problem is, because you are reading a self-selected sample of people motivated enough to post.

So the skill separates two kinds of evidence and only one of them can support a claim about the market:

- **Qualitative language evidence** — forums, reviews, support tickets, sales calls, interviews. Tells you words, frustrations, desires, objections, hypotheses.
- **Quantitative demand evidence** — search volume, sales data, surveys with a described sample, your own analytics. Tells you scale.

An angle that asserts "most people struggle with X" needs the second kind. `scripts/angles.mjs` enforces this: it refuses to compile a `demand-evidence` angle whose themes contain nothing but forum chatter.

Read `references/method.md` before your first run. It carries the evidence classes, ranking model, counter-signal rules and uncertainty language.

## Step 1 — Build the brief from what you already have

**Do not interview the user.** Read what is already available: the repository README, product and positioning docs, landing-page copy, prior runs of this skill, anything they have already said in this conversation. Fill in as much of `templates/brief.json` as you can from that.

Then show a five-line brief and **keep going**:

```
Product    — <what it is, in one line>
Audience   — <who this run is about>
Decision   — <what this research should improve>
Sources    — <where you will look, and the limits>
Assuming   — <anything you inferred rather than read>
```

Stop and ask **only** when something material is genuinely missing or ambiguous — meaning a different answer would produce a different research plan. In practice that is: no identifiable product, no identifiable audience, or two plausible audiences that would send you to completely different sources. Everything else: state your assumption on the `Assuming` line and continue. A wrong assumption that is written down is cheap to correct; a question the user already answered is expensive to ask.

## Step 2 — Gather signals

Free web research proceeds within the limits below — no approval needed. Default bounds per run:

- ≤ 6 venues (a site, community or system), ≤ 4 communities within them, ≤ 20 threads or documents
- prefer material published in the last 12 months; record the date of anything older
- stop early when new sources stop producing new themes

**The cost gate applies only to genuine marginal cost** — paid APIs, paid data pulls, credit-metered search, anything that spends the user's money. Before any of those: state what you will fetch, how many units, and the expected cost, then wait for a yes. Never assume a prior approval covers a later fetch.

Respect each source's terms. Do not scrape a platform that requires authorised API access; use its official interface, public web search or manual review instead.

Record each signal in `run.json` (skeleton at `templates/run.json`):

- `url` and `accessedAt` are mandatory — a signal you cannot link to does not exist
- `paraphrase` is your own words, never a verbatim quote, never a username
- `authorRef` and `threadRef` are opaque local aliases (`a1`, `t3`), assigned by you so the script can count distinct people and threads without storing identities
- `evidenceClass` says what kind of claim this signal can support

Give every signal an honest class. `hypothesis` is a legitimate class and using it is not a failure.

## Step 3 — Cluster into themes

A theme needs a statement, its signal ids, and a **counter-signal**: what contradicts, limits or complicates the pattern. Something that would make you wrong. If you cannot find one, that is a finding — write "none found, and here is where I looked", which is a different claim from leaving the field empty.

Counts are *derived by the script* from your signals. Never type a count into the file.

## Step 4 — Write angles and hooks

An angle names the problem or desire and takes a position on it. It is not a slogan and not a summary of the theme.

Each angle carries `claimType`, a `rankingRationale` in plain language, judgement scores, and 3–6 hooks tagged with format and channel. Give hooks genuine variety — a reel opener, a headline and an ad line are different instruments.

## Step 5 — Compile

```bash
node scripts/angles.mjs run.json --out angles-report.md
```

The script validates, derives every count, scores, ranks, and writes the report. It never touches the network. If it exits non-zero, fix the run file — do not work around the error.

Read `references/report-template.md` for the output shape and `references/worked-example.md` for a complete small run.

## Failure mode to guard against

**Evidence theatre** — a beautifully formatted report whose signals were half-remembered, reconstructed from what you expect people to say, or quietly invented. This is the most likely way this skill produces something worse than useless, because a polished table of author and thread counts is exactly the artefact a language model can fabricate convincingly.

Three defences, and you must not weaken any of them: every signal carries a URL you actually opened plus the date you opened it; counts are derived, never asserted; the report header always prints the sample size, so a thin run looks thin.

If the evidence is thin, say so on the face of the report and rank fewer angles. Three well-grounded angles beat five confident ones.

## Files

| Path | What it is |
|---|---|
| `references/method.md` | Evidence classes, ranking model, rules |
| `references/report-template.md` | Output shape |
| `references/worked-example.md` | End-to-end small run |
| `templates/brief.json` | Input contract |
| `templates/run.json` | Run skeleton |
| `examples/worked-example.run.json` | A run file that compiles |
| `scripts/angles.mjs` | Validate, score, render. Zero dependencies |
| `scripts/angles.test.mjs` | `node --test scripts/angles.test.mjs` |

Requires Node 18+. No install step, no dependencies, no configuration.
