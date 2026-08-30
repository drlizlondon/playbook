# Worked example

A complete small run, from signals to hooks.

> **Everything in `examples/worked-example.run.json` is invented.** Every URL points at `example.com`. It exists to exercise the compiler and to show the shape of a good run — never copy its signals, and never let an example run stand in for research you have not done. A fabricated run that looks real is the exact failure this skill is built to prevent.

Regenerate the report at any time:

```bash
node scripts/angles.mjs examples/worked-example.run.json --now 2026-08-12 --out /tmp/report.md
```

## The brief

- **Product** — Rota, shift swapping and cover for independent cafés
- **Audience** — owner-managers of one-to-three site UK cafés, 6–25 staff, currently running rotas in a spreadsheet and a group chat
- **Decision** — which three angles to test on paid social and the landing page next month
- **Assumed, not read** — the owner-manager is also the buyer; staff resist app installs

Two assumptions are written on the face of the report rather than turned into questions. That is the intended behaviour: a visible wrong assumption is cheap, an unnecessary question is not.

## The evidence

Ten signals across six venues and four evidence classes:

| Class | Count | What it does here |
|---|---:|---|
| `qualitative-language` | 5 | Public forums, an owner group, marketplace reviews — supplies the words |
| `internal-data` | 3 | Helpdesk queue, interviews, sales calls — supplies scale within our own users |
| `competitor-positioning` | 1 | What the category currently sells on |
| `quantitative-demand` | 1 | A search export — the only signal entitled to speak to prevalence |

One signal, the search export, has no `authorRef`, because search data has no author. The compiler warns and counts distinct people honestly rather than inflating the number.

## The result

| # | Angle | Score | Confidence | Claim |
|---:|---|---:|---|---|
| 1 | Your rota is not the problem. The forty messages it takes to change it is. | 89 | strong | language-evidence |
| 2 | Cafés are searching for cover four times as often as a rota builder. | 74 | strong | demand-evidence |
| 3 | The one your part-timers will actually open — because they don't have to install it. | 69 | moderate | language-evidence |
| 4 | Stop paying for cover somebody would have taken for free. | 65 | moderate | language-evidence |
| — | Get your day off back. | 53 | moderate | *emerging* |
| — | Pricing that doesn't punish you for hiring students. | 17 | hypothesis | *archived* |

Four things in that table are worth understanding, because they are the design working:

**Angle 1 wins on breadth, not volume.** Its theme has five distinct sources across four communities and four source types. No count of comments contributed anything.

**Angle 2 is the only one allowed to say "four times as often".** It is `demand-evidence`, and it compiles only because a `quantitative-demand` signal sits under it. Point it at the forum-only theme instead and the run refuses to build — that case is pinned by a test.

**Angle 3 ranks third on moderate evidence.** Two sources only, but it answers the objection that killed the previous two purchases. Evidence strength is 40% of the score, not all of it — human judgement about fit and testability carries the rest, which is why every angle must state its ranking rationale.

**The most emotionally appealing line is not in the list.** "Get your day off back" sits in emerging at 53, because it rests on a first-party-heavy theme and is hard to falsify with one test. The archived pricing angle scores 17 — one source, and a one-star review cluster at that, which triggers the thinness penalty. Both are the discipline doing its job against taste.

## What the compiler added by itself

Beyond the three gaps the analyst recorded, it detected and appended:

> Theme "Per-head pricing reads as a penalty" rests on a single source — find independent corroboration.

Nobody has to remember to write that. It falls out of the counts.

## Building your own run

1. Copy `templates/run.json`.
2. Add signals as you read them — URL and access date every time, paraphrase in your own words, opaque aliases for people and threads.
3. Cluster into themes and write a counter-signal for each. Something that would make you wrong.
4. Write angles, then 3–6 hooks under each, varying the instrument rather than rewording one line.
5. Compile. If it exits non-zero, fix the run file rather than working around the error — every rule it enforces is one that keeps the report honest.
